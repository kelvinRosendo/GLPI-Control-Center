const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(fetch) {
  const window = {DATA: {classifiedAssets: [{id: 1}]}, GlpiClient: {_fetch: fetch}};
  vm.runInNewContext(fs.readFileSync(__dirname + '/javascript/asset_classifier.js', 'utf8'), {window, console, Map, Date});
  return window.AssetClassifier;
}
test('concurrent assets and sync status use separate requests', async () => {
  const calls = [];
  const api = setup(async path => { calls.push(path); return {data: path === '/api/assets/all' ? [{id: 2}] : {status: 'failed'}}; });
  const [assets, status] = await Promise.all([api.fetchAllClassified(), api.fetchSyncStatus()]);
  assert.equal(calls.length, 2); assert.equal(assets.data[0].id, 2); assert.equal(status.data.status, 'failed');
});
test('failed sync payload cannot be presented as successful', async () => {
  const api = setup(async () => ({data: {sync_info: {status: 'failed'}}}));
  assert.equal((await api.runFullSync()).ok, false);
  assert.equal((await api.runIncrementalSync()).ok, false);
});
test('after successful sync fetch fresh assets despite five-second client cache', async () => {
  let count = 0;
  const api = setup(async path => path.includes('/sync/') ? {data: {sync_info: {status: 'success'}}} : {data: [{id: ++count}]});
  await api.fetchAllClassified();
  assert.equal((await api.runFullSync()).ok, true);
  assert.equal((await api.fetchAllClassified()).data[0].id, 2);
});
