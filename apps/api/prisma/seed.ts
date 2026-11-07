import { prisma } from "../src/lib/prisma";
import { sha256 } from "../src/utils/crypto";

async function main() {
  const passwordHash = sha256("correct-horse-battery-staple");

  // 1. Users
  const customer = await prisma.user.upsert({
    where: { emailCanonical: "customer@velapal.demo" },
    update: {},
    create: {
      id: "usr_cust_01",
      emailCanonical: "customer@velapal.demo",
      passwordHash,
      name: "Daffa Yunus",
      mfaEnabled: false,
    },
  });

  const seller = await prisma.user.upsert({
    where: { emailCanonical: "seller@velapal.demo" },
    update: {},
    create: {
      id: "usr_sell_01",
      emailCanonical: "seller@velapal.demo",
      passwordHash,
      name: "Ibnu Mahdi",
      mfaEnabled: false,
    },
  });

  const admin = await prisma.user.upsert({
    where: { emailCanonical: "admin@velapal.demo" },
    update: {},
    create: {
      id: "usr_admin_01",
      emailCanonical: "admin@velapal.demo",
      passwordHash,
      name: "Yunggi Alyana Rahman",
      mfaEnabled: true,
    },
  });

  // 2. Workspaces
  const wsCust = await prisma.workspace.upsert({
    where: { id: "ws_cust_01" },
    update: {},
    create: {
      id: "ws_cust_01",
      type: "CUSTOMER",
      name: "Personal Workspace",
      merchantId: null,
    },
  });

  const wsSell = await prisma.workspace.upsert({
    where: { id: "ws_sell_01" },
    update: {},
    create: {
      id: "ws_sell_01",
      type: "SELLER",
      name: "Vela Market",
      merchantId: "merch_vela_01",
    },
  });

  const wsAdm = await prisma.workspace.upsert({
    where: { id: "ws_adm_01" },
    update: {},
    create: {
      id: "ws_adm_01",
      type: "ADMIN",
      name: "VelaPal Operations",
      merchantId: null,
    },
  });

  // 3. Memberships
  await prisma.membership.upsert({
    where: {
      userId_workspaceId_role: {
        userId: customer.id,
        workspaceId: wsCust.id,
        role: "CUSTOMER",
      },
    },
    update: {},
    create: {
      userId: customer.id,
      workspaceId: wsCust.id,
      role: "CUSTOMER",
      permissions: ["transactions.read", "disputes.create", "disputes.read"],
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_workspaceId_role: {
        userId: seller.id,
        workspaceId: wsSell.id,
        role: "SELLER_OWNER",
      },
    },
    update: {},
    create: {
      userId: seller.id,
      workspaceId: wsSell.id,
      role: "SELLER_OWNER",
      permissions: ["orders.read", "disputes.create", "disputes.read", "settlements.execute"],
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_workspaceId_role: {
        userId: admin.id,
        workspaceId: wsAdm.id,
        role: "SUPERVISOR",
      },
    },
    update: {},
    create: {
      userId: admin.id,
      workspaceId: wsAdm.id,
      role: "SUPERVISOR",
      permissions: ["disputes.read", "disputes.investigate", "disputes.intervene", "audit.read"],
    },
  });

  // 4. Catalog Product
  const pocketDrive = await prisma.product.upsert({
    where: { sku: "PD-256-M" },
    update: {},
    create: {
      id: "prod_pocket_drive",
      merchantId: "merch_vela_01",
      merchantName: "Vela Market",
      sku: "PD-256-M",
      name: "Pocket Drive NVMe SSD",
      type: "PHYSICAL",
      priceMinor: 5900,
      currency: "USD",
      variants: [
        { variantId: "128GB", sku: "PD-128-M", label: "128 GB", priceMinor: 3900 },
        { variantId: "256GB", sku: "PD-256-M", label: "256 GB", priceMinor: 5900 },
      ],
    },
  });

  // 5. Snapshot & Transaction for VP-0421 (USD 59.00 Paid) and VP-0422 (USD 49.00 Unconfirmed)
  const snap1 = await prisma.purchaseSnapshot.upsert({
    where: { id: "snap_01JBYA" },
    update: {},
    create: {
      id: "snap_01JBYA",
      customerId: customer.id,
      merchantId: "merch_vela_01",
      productId: pocketDrive.id,
      sku: "PD-256-M",
      variantId: "256GB",
      quantity: 1,
      amountMinor: 5900,
      currency: "USD",
      terms: "Pocket Drive NVMe SSD (256 GB) x1 — USD 59.00",
      snapshotHash: "sha256_8f9d2a1b3c4d5e6f",
    },
  });

  await prisma.transaction.upsert({
    where: { id: "tx_vp_1028" },
    update: {},
    create: {
      id: "tx_vp_1028",
      orderId: "ord_vp_1028",
      customerId: customer.id,
      merchantId: "merch_vela_01",
      merchantName: "Vela Market",
      snapshotId: snap1.id,
      paypalOrderId: "5O190127TN364715T",
      paypalCaptureId: "2GG903537H408804M",
      amountMinor: 5900,
      refundableRemainingMinor: 5900,
      currency: "USD",
      paymentStatus: "PAID",
      verifiedAt: new Date(),
    },
  });

  // VP-0422 Order (Payment Unconfirmed - No Capture ID yet)
  await prisma.transaction.upsert({
    where: { id: "tx_vp_1033" },
    update: {},
    create: {
      id: "tx_vp_1033",
      orderId: "ord_vp_1033",
      customerId: customer.id,
      merchantId: "merch_vela_01",
      merchantName: "Vela Market",
      snapshotId: snap1.id,
      paypalOrderId: "8X991122AB123456C",
      paypalCaptureId: null,
      amountMinor: 4900,
      refundableRemainingMinor: 0,
      currency: "USD",
      paymentStatus: "UNCONFIRMED",
    },
  });

  // 6. Seed Case VP-0421 (Customer-initiated capacity mismatch)
  await prisma.disputeCase.upsert({
    where: { id: "case_vp_0421" },
    update: {},
    create: {
      id: "case_vp_0421",
      issueKey: "ord_vp_1028:ITEM_NOT_AS_DESCRIBED",
      transactionId: "tx_vp_1028",
      orderId: "ord_vp_1028",
      customerId: customer.id,
      merchantId: "merch_vela_01",
      initiatorParty: "CUSTOMER",
      category: "ITEM_NOT_AS_DESCRIBED",
      stage: "MEDIATING",
      control: "WAITING_ADMIN",
      caseVersion: 3,
      controlVersion: 2,
      privateContextVersion: 1,
      accessRevision: 3,
      customerStatement: "I ordered 256 GB. The received item is labelled 128 GB.",
      sellerStatement: "Our invoice records SKU PD-256-M. Packing serial still needs checking.",
      gateReason: "MATERIAL_CONFLICT_INVOICE_VS_LABEL",
      assignedReviewerId: admin.id,
    },
  });

  console.log("✅ VelaPal V6.1 seed complete!");
  console.log("   Customer: customer@velapal.demo");
  console.log("   Seller:   seller@velapal.demo");
  console.log("   Admin:    admin@velapal.demo (MFA code: 123456)");
  console.log("   Password for all demo accounts: correct-horse-battery-staple");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
