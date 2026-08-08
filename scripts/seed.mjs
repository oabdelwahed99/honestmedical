/**
 * Fills the database with sample products, movements, expenses, invoices and
 * partners so the app can be explored right away. Run with: npm run seed
 *
 * WARNING: this clears the related collections first.
 */
import { MongoClient, ObjectId } from "mongodb";
import { readFileSync } from "node:fs";

function readEnv(key, fallback) {
  if (process.env[key]) return process.env[key];

  for (const file of [".env.local", ".env"]) {
    try {
      const match = readFileSync(file, "utf8").match(
        new RegExp(`^${key}=(.+)$`, "m"),
      );
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      // File is optional.
    }
  }

  return fallback;
}

const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const monthKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const SEED = [
  {
    name: "زيت عباد الشمس",
    unit: "كرتونة",
    purchasePrice: 480,
    salePrice: 560,
    lowStockThreshold: 5,
    expiryDate: daysFromNow(240),
    opening: 40,
    moves: [
      { type: "purchase", quantity: 20, price: 490, days: -18, note: "مورد النور" },
      { type: "sale", quantity: 12, price: 570, days: -12, note: "سوبر ماركت الأمل" },
      { type: "sale", quantity: 9, price: 565, days: -4, note: "عميل نقدي" },
    ],
  },
  {
    name: "أرز مصري",
    unit: "كيلو",
    purchasePrice: 28,
    salePrice: 34,
    lowStockThreshold: 50,
    expiryDate: daysFromNow(400),
    opening: 300,
    moves: [
      { type: "sale", quantity: 120, price: 34, days: -9, note: "مطعم البركة" },
      { type: "purchase", quantity: 200, price: 27.5, days: -6, note: "مضرب الدلتا" },
      { type: "sale", quantity: 85, price: 35, days: -2, note: "عميل جملة" },
    ],
  },
  {
    name: "لبن كامل الدسم",
    unit: "زجاجة",
    purchasePrice: 22,
    salePrice: 28,
    lowStockThreshold: 24,
    expiryDate: daysFromNow(12),
    opening: 60,
    moves: [
      { type: "sale", quantity: 30, price: 28, days: -3, note: "بيع يومي" },
      { type: "sale", quantity: 18, price: 28, days: -1, note: "بيع يومي" },
    ],
  },
  {
    name: "معجون طماطم",
    unit: "علبة",
    purchasePrice: 14,
    salePrice: 19,
    lowStockThreshold: 30,
    expiryDate: daysFromNow(520),
    opening: 150,
    moves: [
      { type: "sale", quantity: 40, price: 19, days: -7, note: "بقالة السلام" },
      { type: "adjustment", counted: 104, days: -5, note: "جرد: عبوات تالفة" },
    ],
  },
  {
    name: "مياه معدنية",
    unit: "جركن",
    purchasePrice: 35,
    salePrice: 45,
    lowStockThreshold: 10,
    expiryDate: daysFromNow(180),
    opening: 8,
    moves: [{ type: "sale", quantity: 3, price: 45, days: -1, note: "عميل نقدي" }],
  },
  {
    name: "صابون غسيل",
    unit: "قطعة",
    purchasePrice: 9,
    salePrice: 13,
    lowStockThreshold: 40,
    expiryDate: null,
    opening: 200,
    moves: [
      { type: "purchase", quantity: 100, price: 8.5, days: -14, note: "مصنع النظافة" },
      { type: "sale", quantity: 130, price: 13, days: -8, note: "توزيع مناطق" },
    ],
  },
];

const uri = readEnv(
  "MONGODB_URI",
  "mongodb://127.0.0.1:27017/stock_management",
);
const dbName = readEnv("MONGODB_DB", "stock_management");
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const db = client.db(dbName);
  const products = db.collection("products");
  const transactions = db.collection("transactions");
  const expenses = db.collection("expenses");
  const recurringexpenses = db.collection("recurringexpenses");
  const invoices = db.collection("invoices");
  const partners = db.collection("partners");
  const partnerentries = db.collection("partnerentries");

  await Promise.all([
    products.deleteMany({}),
    transactions.deleteMany({}),
    expenses.deleteMany({}),
    recurringexpenses.deleteMany({}),
    invoices.deleteMany({}),
    partners.deleteMany({}),
    partnerentries.deleteMany({}),
  ]);

  let productCount = 0;
  let movementCount = 0;
  const productDocs = [];

  for (const item of SEED) {
    const productId = new ObjectId();
    const now = new Date();
    let balance = 0;
    const ledger = [];

    const push = (type, quantity, purchasePrice, salePrice, total, date, partyName, note = "") => {
      const before = balance;
      balance =
        type === "purchase"
          ? before + quantity
          : type === "sale"
            ? before - quantity
            : before + quantity;
      ledger.push({
        product: productId,
        productName: item.name,
        unit: item.unit,
        type,
        date,
        quantity: Math.abs(quantity),
        purchasePrice,
        salePrice,
        total,
        balanceBefore: before,
        balanceAfter: balance,
        expiryDate: item.expiryDate,
        partyName,
        note,
        invoice: null,
        invoiceNumber: "",
        createdAt: date,
        updatedAt: date,
      });
      movementCount += 1;
    };

    push(
      "purchase",
      item.opening,
      item.purchasePrice,
      item.salePrice,
      item.opening * item.purchasePrice,
      daysFromNow(-30),
      "رصيد افتتاحي",
    );

    for (const move of item.moves) {
      const date = daysFromNow(move.days);

      if (move.type === "adjustment") {
        push(
          "adjustment",
          move.counted - balance,
          item.purchasePrice,
          item.salePrice,
          0,
          date,
          move.note,
          move.note,
        );
      } else if (move.type === "purchase") {
        push(
          "purchase",
          move.quantity,
          move.price,
          item.salePrice,
          move.quantity * move.price,
          date,
          move.note,
        );
      } else {
        push(
          "sale",
          move.quantity,
          item.purchasePrice,
          move.price,
          move.quantity * move.price,
          date,
          move.note,
        );
      }
    }

    const productDoc = {
      _id: productId,
      name: item.name,
      unit: item.unit,
      quantity: balance,
      purchasePrice: item.purchasePrice,
      salePrice: item.salePrice,
      expiryDate: item.expiryDate,
      lowStockThreshold: item.lowStockThreshold,
      note: "",
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    productDocs.push(productDoc);
    await products.insertOne(productDoc);
    await transactions.insertMany(ledger.map((row) => ({ ...row, __v: 0 })));
    productCount += 1;
  }

  const now = new Date();
  const currentMonth = monthKey(now);
  const salaryId = new ObjectId();
  const rentId = new ObjectId();

  await recurringexpenses.insertMany([
    {
      _id: salaryId,
      category: "salary",
      label: "راتب أمين المخزن",
      amount: 4500,
      behavior: "fixed",
      paidTo: "أحمد محمود",
      dayOfMonth: 1,
      active: true,
      note: "",
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      _id: rentId,
      category: "rent",
      label: "إيجار المخزن",
      amount: 8000,
      behavior: "fixed",
      paidTo: "المالك",
      dayOfMonth: 1,
      active: true,
      note: "",
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      category: "vehicle",
      label: "صيانة سيارة التوزيع",
      amount: 600,
      behavior: "variable",
      paidTo: "ورشة النصر",
      dayOfMonth: 15,
      active: true,
      note: "",
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
  ]);

  await expenses.insertMany([
    {
      category: "salary",
      label: "راتب أمين المخزن",
      amount: 4500,
      date: new Date(now.getFullYear(), now.getMonth(), 1),
      behavior: "fixed",
      paidTo: "أحمد محمود",
      note: `توليد تلقائي — ${currentMonth}`,
      recurring: salaryId,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      category: "rent",
      label: "إيجار المخزن",
      amount: 8000,
      date: new Date(now.getFullYear(), now.getMonth(), 1),
      behavior: "fixed",
      paidTo: "المالك",
      note: `توليد تلقائي — ${currentMonth}`,
      recurring: rentId,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      category: "utilities",
      label: "فاتورة كهرباء",
      amount: 1200,
      date: daysFromNow(-5),
      behavior: "fixed",
      paidTo: "شركة الكهرباء",
      note: "",
      recurring: null,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      category: "parking",
      label: "رسوم مواقف",
      amount: 300,
      date: daysFromNow(-3),
      behavior: "fixed",
      paidTo: "إدارة المواقف",
      note: "",
      recurring: null,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      category: "maintenance",
      label: "صيانة ثلاجة",
      amount: 750,
      date: daysFromNow(-8),
      behavior: "variable",
      paidTo: "فني تبريد",
      note: "",
      recurring: null,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
  ]);

  // Create one sample invoice against the first seeded product.
  const oil = productDocs[0];
  const invoiceId = new ObjectId();
  const invoiceNumber = `INV-${now.getFullYear()}-0001`;
  const invoiceQty = 2;
  const invoiceDate = daysFromNow(-2);
  const saleTotal = invoiceQty * oil.salePrice;
  const cogs = invoiceQty * oil.purchasePrice;
  const balanceBefore = oil.quantity;
  const balanceAfter = oil.quantity - invoiceQty;
  const movementId = new ObjectId();

  await products.updateOne(
    { _id: oil._id },
    { $set: { quantity: balanceAfter, updatedAt: now } },
  );

  await transactions.insertOne({
    _id: movementId,
    product: oil._id,
    productName: oil.name,
    unit: oil.unit,
    type: "sale",
    date: invoiceDate,
    quantity: invoiceQty,
    purchasePrice: oil.purchasePrice,
    salePrice: oil.salePrice,
    total: saleTotal,
    balanceBefore,
    balanceAfter,
    expiryDate: oil.expiryDate,
    partyName: "هايبر المدينة",
    note: `فاتورة ${invoiceNumber}`,
    invoice: invoiceId,
    invoiceNumber,
    createdAt: invoiceDate,
    updatedAt: invoiceDate,
    __v: 0,
  });
  movementCount += 1;

  await invoices.insertOne({
    _id: invoiceId,
    number: invoiceNumber,
    date: invoiceDate,
    customerName: "هايبر المدينة",
    items: [
      {
        product: oil._id,
        productName: oil.name,
        unit: oil.unit,
        quantity: invoiceQty,
        salePrice: oil.salePrice,
        purchasePrice: oil.purchasePrice,
        total: saleTotal,
      },
    ],
    subtotal: saleTotal,
    discount: 0,
    total: saleTotal,
    cogs,
    amountPaid: saleTotal,
    status: "paid",
    note: "فاتورة تجريبية",
    movements: [movementId],
    createdAt: now,
    updatedAt: now,
    __v: 0,
  });

  const partnerA = new ObjectId();
  const partnerB = new ObjectId();
  const partnerSalaryTemplateId = new ObjectId();

  await partners.insertMany([
    {
      _id: partnerA,
      name: "أسامة",
      equityPercent: 60,
      salary: 6000,
      phone: "01000000001",
      note: "الشريك الإداري",
      active: true,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      _id: partnerB,
      name: "محمود",
      equityPercent: 40,
      salary: 0,
      phone: "01000000002",
      note: "شريك مالي",
      active: true,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
  ]);

  await recurringexpenses.insertOne({
    _id: partnerSalaryTemplateId,
    category: "salary",
    label: "راتب الشريك: أسامة",
    amount: 6000,
    behavior: "fixed",
    paidTo: "أسامة",
    dayOfMonth: 1,
    active: true,
    note: "راتب شريك — يُولَّد مع المصروفات الشهرية",
    partner: partnerA,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  });

  await expenses.insertOne({
    category: "salary",
    label: "راتب الشريك: أسامة",
    amount: 6000,
    date: new Date(now.getFullYear(), now.getMonth(), 1),
    behavior: "fixed",
    paidTo: "أسامة",
    note: `توليد تلقائي — ${currentMonth}`,
    recurring: partnerSalaryTemplateId,
    partner: partnerA,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  });

  // Partner entries are used only for profit distributions (created from the UI).
  await partnerentries.deleteMany({});
  console.log(
    `تم إدخال ${productCount} صنف و ${movementCount} حركة وفاتورة وشركاء ومصروفات تجريبية.`,
  );
} catch (error) {
  console.error("فشل إدخال البيانات التجريبية:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
