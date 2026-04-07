import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';
import TabBar from '../components/TabBar';
import InventoryStock from '../components/inventory/InventoryStock';
import InventoryItems from '../components/inventory/InventoryItems';
import InventoryTransactions from '../components/inventory/InventoryTransactions';
import InventoryCycleCounts from '../components/inventory/InventoryCycleCounts';
import InventorySetup from '../components/inventory/InventorySetup';
import InventoryValuation from '../components/inventory/InventoryValuation';
import InventoryPurchaseOrders from '../components/inventory/InventoryPurchaseOrders';
import InventoryConversions from '../components/inventory/InventoryConversions';

export default function InventoryPage() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [features, setFeatures] = useState({});
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingConversions, setPendingConversions] = useState(0);
  const [loading, setLoading] = useState(true);

  const INV_TABS = isAdmin
    ? ['stock', 'items', 'transactions', 'orders', 'cycle', 'valuation', 'conversions', 'setup']
    : ['stock', 'transactions'];
  const [poLowStockTrigger, setPoLowStockTrigger] = useState(false);

  const handleReorderClick = () => {
    setPoLowStockTrigger(true);
    switchTab('orders');
  };
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(INV_TABS.includes(hashTab) ? hashTab : 'stock');
  const switchTab = t => { setTab(t); window.location.hash = t; };

  useEffect(() => {
    const init = async () => {
      try {
        const [s, p, l] = await Promise.all([
          api.get('/settings'),
          api.get('/projects'),
          api.get('/inventory/locations'),
        ]);
        setFeatures(s.data);
        setProjects(p.data);
        setLocations(l.data);
        if (isAdmin) {
          api.get('/inventory/stock/low').then(r => setLowStockCount(r.data.length)).catch(() => {});
          api.get('/inventory/uom-conversions').then(r => setPendingConversions(r.data.filter(u => parseFloat(u.factor) === 1).length)).catch(() => {});
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [isAdmin]);

  const refreshLocations   = () => api.get('/inventory/locations').then(r => setLocations(r.data)).catch(() => {});
  const refreshLowStock    = () => isAdmin && api.get('/inventory/stock/low').then(r => setLowStockCount(r.data.length)).catch(() => {});
  const refreshConversions = () => isAdmin && api.get('/inventory/uom-conversions').then(r => setPendingConversions(r.data.filter(u => parseFloat(u.factor) === 1).length)).catch(() => {});

  if (loading) return <div style={styles.loading}>Loading…</div>;

  if (!features.module_inventory) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.logoGroup}>
            <AppSwitcher currentApp="inventory" userRole={user?.role} features={features} />
          </div>
          <div style={styles.headerRight}>
            <button style={styles.headerBtn} onClick={logout}>Logout</button>
          </div>
        </header>
        <div style={styles.disabled}>
          <div style={styles.disabledIcon}>📦</div>
          <h2 style={styles.disabledTitle}>Inventory Not Enabled</h2>
          <p style={styles.disabledBody}>Enable the Inventory module from Administration → Company → Modules.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="inventory" userRole={user?.role} features={features} />
          {user?.company_name && <span style={styles.companyName} className="company-name-desktop">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          {!isAdmin && <span style={styles.userName}>{user?.full_name}</span>}
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      {user?.company_name && (
        <div style={styles.companyBand} className="company-name-row">
          {user.company_name}
        </div>
      )}

      <main style={styles.main}>
        <TabBar
          active={tab}
          onChange={switchTab}
          tabs={[
            { id: 'stock',        label: '📦 Stock', dot: lowStockCount > 0 ? '#f59e0b' : null },
            { id: 'transactions', label: '↔️ Transactions' },
            ...(isAdmin ? [
              { id: 'items',      label: '🗂 Items' },
              { id: 'orders',     label: '🛒 Orders' },
              { id: 'cycle',        label: '📋 Count' },
              { id: 'valuation',    label: '💰 Valuation' },
              { id: 'conversions',  label: '🔄 Conversions', dot: pendingConversions > 0 ? '#d97706' : null },
              { id: 'setup',        label: '⚙️ Setup' },
            ] : []),
          ]}
        />

        {tab === 'stock' && (
          <InventoryStock
            isAdmin={isAdmin}
            locations={locations}
            projects={projects}
            onStockChange={refreshLowStock}
            onReorderClick={isAdmin ? handleReorderClick : null}
          />
        )}
        {tab === 'items' && isAdmin && (
          <InventoryItems onItemChange={refreshLowStock} />
        )}
        {tab === 'transactions' && (
          <InventoryTransactions
            isAdmin={isAdmin}
            locations={locations}
            projects={projects}
            onTransaction={refreshLowStock}
            onConversionSaved={refreshConversions}
          />
        )}
        {tab === 'cycle' && isAdmin && (
          <InventoryCycleCounts
            locations={locations}
            onComplete={refreshLowStock}
          />
        )}
        {tab === 'orders' && isAdmin && (
          <InventoryPurchaseOrders
            locations={locations}
            prefillLowStock={poLowStockTrigger}
            onPrefillHandled={() => setPoLowStockTrigger(false)}
          />
        )}
        {tab === 'valuation' && isAdmin && (
          <InventoryValuation locations={locations} />
        )}
        {tab === 'conversions' && isAdmin && (
          <InventoryConversions onConversionChange={refreshConversions} />
        )}
        {tab === 'setup' && isAdmin && (
          <InventorySetup projects={projects} />
        )}
      </main>
    </div>
  );
}

const HEADER_BG = '#92400e';

const styles = {
  page:          { minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' },
  loading:       { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6b7280' },
  header:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', paddingTop: 'env(safe-area-inset-top)', height: 'calc(52px + env(safe-area-inset-top))', background: HEADER_BG, color: '#fff', position: 'sticky', top: 0, zIndex: 50 },
  logoGroup:     { display: 'flex', alignItems: 'center', gap: 10 },
  companyName:   { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginLeft: 4 },
  companyBand:   { background: HEADER_BG, color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '4px 16px' },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 10 },
  userName:      { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  headerBtn:     { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  main:          { maxWidth: 960, margin: '24px auto 0', padding: '0 16px 80px' },
  disabled:      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, padding: 24 },
  disabledIcon:  { fontSize: 48 },
  disabledTitle: { fontSize: 20, fontWeight: 700, color: '#374151', margin: 0 },
  disabledBody:  { fontSize: 14, color: '#6b7280', textAlign: 'center', maxWidth: 340, margin: 0 },
};
