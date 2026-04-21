const { coerceBody } = require('../middleware/coerce');

function run(middleware, body) {
  const req = { body: { ...body } };
  let statusCode = null;
  let jsonBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { req, statusCode, jsonBody, nextCalled };
}

describe('coerceBody', () => {
  describe('int fields', () => {
    const mw = coerceBody({ int: ['project_id'] });

    test('empty string → null', () => {
      const r = run(mw, { project_id: '' });
      expect(r.nextCalled).toBe(true);
      expect(r.req.body.project_id).toBeNull();
    });

    test('numeric string → integer', () => {
      const r = run(mw, { project_id: '42' });
      expect(r.nextCalled).toBe(true);
      expect(r.req.body.project_id).toBe(42);
    });

    test('already an integer passes through', () => {
      const r = run(mw, { project_id: 7 });
      expect(r.nextCalled).toBe(true);
      expect(r.req.body.project_id).toBe(7);
    });

    test('missing field is left out of body', () => {
      const r = run(mw, {});
      expect(r.nextCalled).toBe(true);
      expect('project_id' in r.req.body).toBe(false);
    });

    test('null passes through as null', () => {
      const r = run(mw, { project_id: null });
      expect(r.nextCalled).toBe(true);
      expect(r.req.body.project_id).toBeNull();
    });

    test('non-numeric string returns 400', () => {
      const r = run(mw, { project_id: 'abc' });
      expect(r.nextCalled).toBe(false);
      expect(r.statusCode).toBe(400);
      expect(r.jsonBody).toEqual({ field: 'project_id', error: 'project_id must be an integer or omitted' });
    });

    test('decimal-looking string returns 400 (not a valid integer)', () => {
      const r = run(mw, { project_id: '3.14' });
      expect(r.nextCalled).toBe(false);
      expect(r.statusCode).toBe(400);
    });
  });

  describe('float fields', () => {
    const mw = coerceBody({ float: ['mileage'] });

    test('empty string → null', () => {
      const r = run(mw, { mileage: '' });
      expect(r.nextCalled).toBe(true);
      expect(r.req.body.mileage).toBeNull();
    });

    test('numeric string → float', () => {
      const r = run(mw, { mileage: '12.5' });
      expect(r.nextCalled).toBe(true);
      expect(r.req.body.mileage).toBe(12.5);
    });

    test('garbage returns 400', () => {
      const r = run(mw, { mileage: 'lots' });
      expect(r.nextCalled).toBe(false);
      expect(r.statusCode).toBe(400);
    });
  });

  describe('bool fields', () => {
    const mw = coerceBody({ bool: ['dry_run'] });

    test('empty string → null', () => {
      const r = run(mw, { dry_run: '' });
      expect(r.nextCalled).toBe(true);
      expect(r.req.body.dry_run).toBeNull();
    });

    test('"true" → true, "false" → false', () => {
      expect(run(mw, { dry_run: 'true' }).req.body.dry_run).toBe(true);
      expect(run(mw, { dry_run: 'false' }).req.body.dry_run).toBe(false);
    });

    test('1 / 0 coerce', () => {
      expect(run(mw, { dry_run: 1 }).req.body.dry_run).toBe(true);
      expect(run(mw, { dry_run: 0 }).req.body.dry_run).toBe(false);
    });
  });

  test('no body (GET request) is a no-op', () => {
    const mw = coerceBody({ int: ['project_id'] });
    const req = {};
    let nextCalled = false;
    mw(req, {}, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('multiple field types in one schema', () => {
    const mw = coerceBody({
      int: ['project_id'],
      float: ['mileage'],
      bool: ['approved'],
    });
    const r = run(mw, { project_id: '5', mileage: '7.2', approved: 'true', other: 'untouched' });
    expect(r.nextCalled).toBe(true);
    expect(r.req.body).toEqual({ project_id: 5, mileage: 7.2, approved: true, other: 'untouched' });
  });
});
