import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATALOG = [
  {
    sku: "LL-GPU-H100-1HR",
    name: "NVIDIA H100 GPU Cloud Instance (1 hour)",
    merchant: "Lambda Labs, Inc.",
    merchantId: "MERCH_LL_9921",
    domain: "lambdalabs.com",
    category: "Cloud Compute",
    description: "On-demand H100 SXM instance for fine-tuning and inference workloads.",
    price: "24.00",
  },
  {
    sku: "LL-GPU-A10-1HR",
    name: "NVIDIA A10 GPU Cloud Instance (1 hour)",
    merchant: "Lambda Labs, Inc.",
    merchantId: "MERCH_LL_9921",
    domain: "lambdalabs.com",
    category: "Cloud Compute",
    description: "Cost-efficient A10 instance for batch inference and evaluation.",
    price: "9.50",
  },
  {
    sku: "RP-CPU-EPYC-1HR",
    name: "AMD EPYC CPU Cluster Hour",
    merchant: "RunPod Corp",
    merchantId: "MERCH_RP_3310",
    domain: "runpod.io",
    category: "Cloud Compute",
    description: "High-memory EPYC cluster hour for data processing pipelines.",
    price: "4.20",
  },
  {
    sku: "CW-B200-RESERVED",
    name: "CoreWeave B200 Reserved Node (168 hours)",
    merchant: "CoreWeave, Inc.",
    merchantId: "MERCH_CW_1180",
    domain: "coreweave.com",
    category: "Cloud Compute",
    description: "Reserved eight-GPU B200 node for a weekly training run.",
    price: "4120.00",
  },
  {
    sku: "GH-TEAM-SEAT",
    name: "GitHub Team Seat (monthly)",
    merchant: "GitHub, Inc.",
    merchantId: "MERCH_GH_2201",
    domain: "github.com",
    category: "SaaS Licenses",
    description: "Per-seat source control and CI minutes for the engineering team.",
    price: "4.00",
  },
  {
    sku: "FG-PRO-SEAT",
    name: "Figma Professional Seat (monthly)",
    merchant: "Figma, Inc.",
    merchantId: "MERCH_FG_8842",
    domain: "figma.com",
    category: "SaaS Licenses",
    description: "Design collaboration seat for product engineering.",
    price: "15.00",
  },
  {
    sku: "AN-TEAM-SEAT",
    name: "Anthropic Team Seat (monthly)",
    merchant: "Anthropic PBC",
    merchantId: "MERCH_AN_5520",
    domain: "anthropic.com",
    category: "SaaS Licenses",
    description: "Model access seat for internal inference evaluation.",
    price: "30.00",
  },
  {
    sku: "LG-STAND-ALUM",
    name: "Anodised Aluminium Laptop Stand",
    merchant: "Northline Supply Co.",
    merchantId: "MERCH_NS_7710",
    domain: "northlinesupply.com",
    category: "Office Hardware",
    description: "Adjustable aluminium laptop stand with cable routing.",
    price: "38.00",
  },
  {
    sku: "LG-DOCK-USB4",
    name: "USB4 Triple-Display Dock",
    merchant: "Northline Supply Co.",
    merchantId: "MERCH_NS_7710",
    domain: "northlinesupply.com",
    category: "Office Hardware",
    description: "USB4 dock with 100W passthrough for engineering workstations.",
    price: "129.00",
  },
  {
    sku: "TW-REGISTER-API",
    name: "Twilio Programmable Registrations (monthly)",
    merchant: "Twilio Inc.",
    merchantId: "MERCH_TW_6601",
    domain: "twilio.com",
    category: "Communications",
    description: "Registration API volume for verification workflows.",
    price: "25.00",
  },
  {
    sku: "DD-LOGS-API",
    name: "Datadog Log Management (100GB)",
    merchant: "Datadog, Inc.",
    merchantId: "MERCH_DD_4402",
    domain: "datadoghq.com",
    category: "Observability",
    description: "Log ingestion and retention for production enclaves.",
    price: "62.40",
  },
  {
    sku: "SC-EGRESS-100GB",
    name: "Scaleway Egress Bundle (100GB)",
    merchant: "Scaleway S.A.S.",
    merchantId: "MERCH_SC_9920",
    domain: "scaleway.com",
    category: "Cloud Compute",
    description: "Pre-paid egress bundle for multi-region agent traffic.",
    price: "8.00",
  },
];

async function main() {
  for (const item of CATALOG) {
    await prisma.catalogItem.upsert({
      where: { sku: item.sku },
      create: { ...item, currency: "USD" },
      update: {
        name: item.name,
        merchant: item.merchant,
        merchantId: item.merchantId,
        domain: item.domain,
        category: item.category,
        description: item.description,
        price: item.price,
        currency: "USD",
      },
    });
  }
  const count = await prisma.catalogItem.count();
  console.log(`PACT catalog ready: ${count} purchasable items.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
