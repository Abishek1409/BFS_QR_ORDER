# Requirements Document

## Introduction

When a customer places an order from the QR ordering site, the billing site at the counter prints a bill and assigns the order a bill number. The customer site does not show that bill number today. This feature makes sure the customer site reliably receives the bill number from the billing site and shows it on the confirmation screen and in the pending orders panel.

## Glossary

- **Ordering_Site**: The customer-facing web page (`public/index.html`) opened by scanning the table QR code.
- **Billing_Site**: The counter application that receives orders, prints bills and assigns bill numbers.
- **Realtime_Database**: The Firebase Realtime Database shared by the Ordering_Site and the Billing_Site.
- **Order_Record**: The entry for an order stored at `orders/{orderId}` in the Realtime_Database.
- **Status_Record**: The entry for an order stored at `orderStatus/{orderId}` in the Realtime_Database.
- **Bill_Number**: The identifier the Billing_Site assigns to an order when the bill is printed.
- **Confirmation_Screen**: The Ordering_Site screen shown right after an order is placed.
- **Pending_Orders_Panel**: The Ordering_Site panel listing orders placed during the current browser session with their status.
- **Valid_Bill_Number**: A Bill_Number that is a non-empty string or a finite number.

## Requirements

### Requirement 1

**User Story:** As a customer, I want to see my bill number after the counter prints my bill, so that I can identify my order when collecting it.

#### Acceptance Criteria

1. WHEN the Billing_Site writes a Valid_Bill_Number to the Status_Record of an order, THE Ordering_Site SHALL display the Bill_Number on the Confirmation_Screen within 3 seconds.
2. WHEN the Billing_Site writes a Valid_Bill_Number to the Order_Record of an order, THE Ordering_Site SHALL display the Bill_Number on the Confirmation_Screen within 3 seconds.
3. WHEN the Ordering_Site receives a Valid_Bill_Number for an order, THE Ordering_Site SHALL display the Bill_Number in the Pending_Orders_Panel entry for that order.
4. WHILE the Ordering_Site has not received a Valid_Bill_Number for an order, THE Ordering_Site SHALL display a waiting message for that order.

### Requirement 2

**User Story:** As a customer, I want the bill number shown exactly as printed on my bill, so that the number on screen matches the paper bill.

#### Acceptance Criteria

1. WHEN the Ordering_Site receives a numeric Bill_Number, THE Ordering_Site SHALL display the Bill_Number padded with leading zeros to a minimum of 3 digits.
2. WHEN the Ordering_Site receives a non-numeric string Bill_Number, THE Ordering_Site SHALL display the string value unchanged.
3. IF the Ordering_Site receives a Bill_Number that is empty or null, THEN THE Ordering_Site SHALL continue to display the waiting message for that order.

### Requirement 3

**User Story:** As a customer, I want my bill number to still appear if I reload the page, so that I do not lose track of my order.

#### Acceptance Criteria

1. WHEN the Ordering_Site loads with pending orders saved in the current browser session, THE Ordering_Site SHALL resume listening for the Bill_Number of each order without a Bill_Number.
2. WHEN the Ordering_Site receives a Bill_Number for a saved order, THE Ordering_Site SHALL store the Bill_Number in the current browser session.

### Requirement 4

**User Story:** As a stall owner, I want failures in receiving bill numbers to be visible, so that I can diagnose why customers do not see their bill numbers.

#### Acceptance Criteria

1. IF the Realtime_Database rejects a read of the Status_Record or Order_Record, THEN THE Ordering_Site SHALL log the error code and the order identifier to the browser console.
2. IF the Realtime_Database rejects a read of both the Status_Record and the Order_Record of an order, THEN THE Ordering_Site SHALL display the message "Ask the counter for your bill number" for that order.
