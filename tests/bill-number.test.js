// Tests the bill number helpers by extracting the real source from public/index.html.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const match = html.match(/\/\/ BEGIN bill-number-helpers[\s\S]*?\/\/ END bill-number-helpers/);
assert.ok(match, 'bill-number-helpers block not found in public/index.html');

const context = {};
vm.runInNewContext(match[0] + '\nthis.extractBillNumber = extractBillNumber; this.formatBillNumber = formatBillNumber;', context);
const { extractBillNumber, formatBillNumber } = context;

// extractBillNumber
assert.strictEqual(extractBillNumber({ billNo: 7 }), 7);
assert.strictEqual(extractBillNumber({ billNo: '12' }), '12');
assert.strictEqual(extractBillNumber({ billNo: ' A12 ' }), 'A12');
assert.strictEqual(extractBillNumber({ billNo: '' }), null);
assert.strictEqual(extractBillNumber({ billNo: '   ' }), null);
assert.strictEqual(extractBillNumber({ billNo: null }), null);
assert.strictEqual(extractBillNumber({ billNo: NaN }), null);
assert.strictEqual(extractBillNumber(null), null);
assert.strictEqual(extractBillNumber({ billNumber: 5 }), 5);
assert.strictEqual(extractBillNumber({ bill_no: 'B3' }), 'B3');
assert.strictEqual(extractBillNumber({ bill_number: 9 }), 9);
assert.strictEqual(extractBillNumber({ bill: 42 }), 42);
assert.strictEqual(extractBillNumber({ billNo: '', billNumber: 8 }), 8);

// formatBillNumber
assert.strictEqual(formatBillNumber(7), '007');
assert.strictEqual(formatBillNumber('12'), '012');
assert.strictEqual(formatBillNumber(1234), '1234');
assert.strictEqual(formatBillNumber('A12'), 'A12');

console.log('bill-number helpers: all tests passed');
