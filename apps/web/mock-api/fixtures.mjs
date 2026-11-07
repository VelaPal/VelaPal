/** Synthetic development fixtures from the supplied starter; never provider proof. */
export const people = [
  {
    id: "usr_cust_01",
    email: "customer@velapal.demo",
    name: "Demo Customer",
    type: "CUSTOMER",
    workspaceId: "ws_cust_01",
    merchantId: null,
    role: "CUSTOMER",
  },
  {
    id: "usr_sell_01",
    email: "seller@velapal.demo",
    name: "Demo Seller",
    type: "SELLER",
    workspaceId: "ws_sell_01",
    merchantId: "merch_vela_01",
    role: "SELLER_OWNER",
  },
  {
    id: "usr_admin_01",
    email: "admin@velapal.demo",
    name: "Demo Supervisor",
    type: "ADMIN",
    workspaceId: "ws_adm_01",
    merchantId: null,
    role: "SUPERVISOR",
  },
];
export const makeWorkspace = (p) => ({
  id: p.workspaceId,
  workspaceId: p.workspaceId,
  type: p.type,
  name:
    p.type === "CUSTOMER"
      ? "Personal Workspace"
      : p.type === "SELLER"
        ? "Vela Market"
        : "VelaPal Operations",
  merchantId: p.merchantId,
  role: p.role,
});
export const fixtureTransaction = {
  id: "tx_vp_1028",
  orderId: "ord_vp_1028",
  customerId: "usr_cust_01",
  merchantId: "merch_vela_01",
  merchantName: "Vela Market",
  paypalOrderId: "5O190127TN364715T",
  paypalCaptureId: "2GG903537H408804M",
  amountMinor: 5900,
  refundableRemainingMinor: 5900,
  currency: "USD",
  paymentStatus: "PAID",
  verifiedAt: "2026-11-05T14:02:10.000Z",
};
export const unconfirmedTransaction = {
  id: "tx_demo_unconfirmed_0422",
  orderId: "ord_demo_unconfirmed_0422",
  customerId: "usr_cust_01",
  merchantId: "merch_vela_01",
  merchantName: "Vela Market",
  paypalOrderId: null,
  paypalCaptureId: null,
  amountMinor: 4900,
  refundableRemainingMinor: 0,
  currency: "USD",
  paymentStatus: "UNCONFIRMED",
  verifiedAt: null,
};
export const fixtureSnapshot = {
  snapshotId: "snap_01JBYA",
  sku: "PD-256-M",
  variantId: "256GB",
  quantity: 1,
  amountMinor: 5900,
  currency: "USD",
  snapshotHash: "synthetic_only_not_provider_verified",
};
