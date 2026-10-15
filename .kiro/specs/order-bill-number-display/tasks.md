# Implementation Plan

- [x] 1. Add bill number parsing and formatting helpers




- [x] 1.1 Implement `extractBillNumber` and `formatBillNumber` in `public/index.html`


  - `extractBillNumber` checks the keys `billNo`, `billNumber`, `bill_no`, `bill_number`, `bill` and returns the first finite number or non-empty trimmed string, otherwise `null`
  - `formatBillNumber` pads numbers and all-digit strings to 3 digits and returns other strings unchanged
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 1.2 Write a Node `node:assert` test script for the helpers


  - Cover numeric, numeric string, alphanumeric, empty, null and alternate-key cases
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Rewrite the bill number listener




- [x] 2.1 Remove the duplicate `watchForBillNumber` definition near `replayConfirmationCheck`


  - Keep one definition only
  - _Requirements: 1.1_


- [x] 2.2 Make `watchForBillNumber` listen on both `orderStatus/{orderId}` and `orders/{orderId}`

  - Use `extractBillNumber` on each snapshot and ignore invalid values
  - On the first valid value, store it, persist it, refresh the Confirmation_Screen and panel, and detach both listeners
  - Store both refs in `pendingOrderListeners` so `removePendingOrder` detaches both
  - _Requirements: 1.1, 1.2, 1.3, 3.2_


- [x] 2.3 Add error callbacks to both listeners





  - Log the order ID, path and `err.code` to the console
  - When both paths fail, set `order.billError = true`, persist it and refresh the UI
  - _Requirements: 4.1, 4.2_



- [x] 3. Update rendering and session restore






 

- [x] 3.1 Update `updateSingleConfirmationScreen` and `renderPendingOrdersPanel`



  - Display values with `formatBillNumber`
  - Show "Ask the counter for your bill number" when `billError` is set and the waiting message otherwise
  - Escape the bill number before inserting it into `innerHTML`
  - _Requirements: 1.3, 1.4, 2.1, 2.2, 4.2_


- [x] 3.2 Update `loadPendingOrders` to keep string bill numbers and restore `billError`

  - Run stored values through `extractBillNumber({ billNo })` instead of `Number()`
  - Confirm `attachPendingOrderListeners` resumes listeners for orders without a bill number
  - _Requirements: 3.1, 3.2_
