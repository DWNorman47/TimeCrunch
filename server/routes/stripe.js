const router = require('express').Router();
const Stripe = require('stripe');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function planFromPrice(priceId) {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  return 'starter';
}

// GET /stripe/status
router.get('/status', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT subscription_status, trial_ends_at, plan, stripe_customer_id, stripe_subscription_id FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    res.json(result.rows[0] || {});
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /stripe/checkout — create Stripe Checkout session
router.post('/checkout', requireAdmin, async (req, res) => {
  const { price_id } = req.body;
  if (!price_id) return res.status(400).json({ error: 'price_id required' });
  try {
    const stripe = getStripe();
    const company = await pool.query(
      'SELECT c.*, u.email FROM companies c JOIN users u ON u.company_id = c.id WHERE c.id = $1 AND u.role = $2 AND u.active = true LIMIT 1',
      [req.user.company_id, 'admin']
    );
    const c = company.rows[0];
    if (!c) return res.status(404).json({ error: 'Company not found' });

    let customerId = c.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: c.email,
        name: c.name,
        metadata: { company_id: String(req.user.company_id) },
      });
      customerId = customer.id;
      await pool.query('UPDATE companies SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.company_id]);
    }

    // If still in trial, carry the remaining trial days over to Stripe
    const trialEnd = c.trial_ends_at && new Date(c.trial_ends_at) > new Date()
      ? Math.floor(new Date(c.trial_ends_at).getTime() / 1000)
      : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${process.env.APP_URL}/admin#billing`,
      cancel_url: `${process.env.APP_URL}/admin#billing`,
      subscription_data: {
        metadata: { company_id: String(req.user.company_id) },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
    });
    res.json({ url: session.url });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); }
});

// POST /stripe/portal — customer billing portal
router.post('/portal', requireAdmin, async (req, res) => {
  try {
    const stripe = getStripe();
    const company = await pool.query('SELECT stripe_customer_id FROM companies WHERE id = $1', [req.user.company_id]);
    const customerId = company.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account found. Subscribe first.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.APP_URL}/admin#billing`,
    });
    res.json({ url: session.url });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); }
});

// POST /stripe/webhook — Stripe sends events here
// NOTE: must receive raw body (configured in index.js before express.json)
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const obj = event.data.object;
    if (event.type === 'checkout.session.completed') {
      const companyId = obj.metadata?.company_id;
      if (companyId && obj.subscription) {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(obj.subscription);
        const plan = planFromPrice(sub.items.data[0]?.price?.id);
        await pool.query(
          'UPDATE companies SET stripe_subscription_id = $1, subscription_status = $2, plan = $3 WHERE id = $4',
          [obj.subscription, 'active', plan, companyId]
        );
      }
    } else if (event.type === 'customer.subscription.updated') {
      const companyId = obj.metadata?.company_id;
      if (companyId) {
        const plan = planFromPrice(obj.items?.data[0]?.price?.id);
        await pool.query(
          'UPDATE companies SET subscription_status = $1, plan = $2 WHERE id = $3',
          [obj.status, plan, companyId]
        );
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const companyId = obj.metadata?.company_id;
      if (companyId) {
        await pool.query(
          'UPDATE companies SET subscription_status = $1 WHERE id = $2',
          ['canceled', companyId]
        );
      }
    } else if (event.type === 'invoice.payment_failed') {
      if (obj.subscription) {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(obj.subscription);
        const companyId = sub.metadata?.company_id;
        if (companyId) {
          await pool.query('UPDATE companies SET subscription_status = $1 WHERE id = $2', ['past_due', companyId]);
        }
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

module.exports = router;
