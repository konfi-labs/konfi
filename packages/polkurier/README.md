# @konfi/polkurier

TypeScript SDK for Polkurier.pl API integration.

## Provenance

The checked-in API description and generated client are based on public
Polkurier API/SDK material. The generated client is included in the public
repository to preserve workspace developer experience and interoperability with
provider integrations.

Polkurier names, API documentation text, endpoint descriptions, examples, and
marks remain attributable to Polkurier and are subject to Polkurier's current
API and brand/trademark terms. Inclusion in Konfi does not imply Polkurier
endorsement or partnership.

## Installation

This package is part of the Konfi monorepo workspace.

## Security Notice

⚠️ **Important**: API credentials should be stored as server-side environment variables only. Never expose credentials to client-side code.

Set `POLKURIER_LOGIN`, `POLKURIER_TOKEN`, and optionally `POLKURIER_HOST` in
the server-side environment that calls this package. See the root
`.env.example` file for placeholder configuration.

## Usage

### Server-Side (Recommended)

Use server actions to make Polkurier API calls with credentials stored securely:

```typescript
// In a Next.js server action
"use server";

import {
  Auth,
  Config,
  PolkurierWebService,
  CreateOrder,
} from "@konfi/polkurier";

export async function createOrder(orderData: OrderData) {
  // Credentials from server environment variables
  const config = new Config({
    authLogin: process.env.POLKURIER_LOGIN!,
    authToken: process.env.POLKURIER_TOKEN!,
    // Optional: Custom API URL (defaults to https://api.polkurier.pl/)
    apiUrl: process.env.POLKURIER_HOST,
  });

  const auth = new Auth(config);
  const webApi = new PolkurierWebService(auth, config);

  // ... create order logic
}
```

### Direct Usage (Server-Side Only)

```typescript
import {
  Auth,
  Config,
  PolkurierWebService,
  CreateOrder,
  Sender,
  Recipient,
  Pack,
  Pickup,
  COD,
  RodCourierService,
  ShipmentType,
  PackType,
} from "@konfi/polkurier";

// Initialize configuration
const config = new Config({
  authLogin: "YOUR_LOGIN",
  authToken: "YOUR_TOKEN",
});

// Create auth and service
const auth = new Auth(config);
const webApi = new PolkurierWebService(auth, config);

// Create an order
const method = new CreateOrder();
method.setShipmentType(ShipmentType.BOX);
method.setCourier("INPOST");

const rodService = new RodCourierService();
rodService.setRod(false);
method.addCourierService(rodService);

method.setDescription("Example package");

const recipient = new Recipient();
recipient.setPerson("Example Recipient");
recipient.setStreet("Example Street");
recipient.setHouseNumber(10);
recipient.setFlatNumber(1);
recipient.setPostcode("00-001");
recipient.setCity("Example City");
recipient.setEmail("recipient@example.com");
recipient.setPhone("000000000");
recipient.setCountry("PL");
method.setRecipient(recipient);

const sender = new Sender();
sender.setPerson("Example Sender");
sender.setStreet("Sender Street");
sender.setHouseNumber(1);
sender.setPostcode("00-002");
sender.setCity("Example City");
sender.setEmail("sender@example.com");
sender.setPhone("000000001");
sender.setCountry("PL");
method.setSender(sender);

const pack = new Pack();
pack.setWidth(10);
pack.setHeight(10);
pack.setLength(10);
pack.setWeight(5);
pack.setAmount(1);
pack.setType(PackType.NST);
method.addPack(pack);

const pickup = new Pickup();
pickup.setDate("2024-05-15");
pickup.setTimeFrom("10:00");
pickup.setTimeTo("14:00");
method.setPickup(pickup);

const cod = new COD();
cod.setAmount(0);
cod.setBankAccount("00000000000000000000000000");
method.setCod(cod);

method.setInsurance(0);

// Execute request
try {
  await webApi.requestMethod(method);
  const data = method.getData();
  console.log(data);
} catch (error) {
  console.error(error);
}
```

## Available Methods

- `CreateOrder` - Create a new shipment order
- `GetStatus` - Get order status
- `GetLabel` - Download shipping label
- `CancelOrder` - Cancel an order
- `AvailableCarriers` - Get available carriers for route
- `Heartbeat` - Check API connectivity
- `GetOrders` - Get list of orders
- `OrderValuation` - Calculate shipping cost
- `GetProtocol` - Get pickup protocol
- `PickupCourier` - Schedule courier pickup
- `InpostParcelMachines` - Get InPost parcel machines locations
- `GetCourierPoint` - Get courier pickup points

## Entities

- `Sender` - Sender address information
- `Recipient` - Recipient address information
- `CoverAddress` - Cover address for package
- `Pack` - Package dimensions and weight
- `Pickup` - Pickup time information
- `COD` - Cash on delivery information

### Courier Services

- `RodCourierService` - ROD (Return of documents) courier service option
- `SmsNotificationRecipientCourierService` - SMS notifications for recipient
- `PhoneNotificationRecipientCourierService` - Phone notifications for recipient
- `DeliveryToOwnHandsCourierService` - Delivery to own hands option

## API Documentation

For full API documentation, use upstream provider documentation:

- https://www.polkurier.pl/integracje
- https://www.polkurier.pl/baza-wiedzy/artykul/interfejs-api-do-pobrania

See the root `THIRD_PARTY_NOTICES.md` file for generated-client provenance and
redistribution notes.
