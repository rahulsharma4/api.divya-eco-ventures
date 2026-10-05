const mongoose = require('mongoose');

const invoiceItemSchema = mongoose.Schema({
  itemDescription: { type: String, required: true },
  hsnCode: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  unit: { type: String, default: 'Pcs' },
  rate: { type: Number, default: 0 },
  gstPercentage: { type: Number, default: 0 },
  amount: { type: Number, default: 0 }
});

const invoiceSchema = mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
    },
    quotation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    invoiceNo: {
      type: String,
      required: true,
      unique: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    // Dispatch and Order References
    referenceNo: { type: String, default: '' },
    otherReferences: { type: String, default: '' },
    buyersOrderNo: { type: String, default: '' },
    buyersOrderDate: { type: Date },
    dispatchDocNo: { type: String, default: '' },
    deliveryNoteDate: { type: Date },
    dispatchedThrough: { type: String, default: '' },
    destination: { type: String, default: '' },
    termsOfDelivery: { type: String, default: '' },

    items: [invoiceItemSchema],
    // Project / Technical Specs
    systemSize: { type: String, default: 'N/A' },
    solarPanels: { type: String, default: 'N/A' },
    inverter: { type: String, default: 'N/A' },
    itemDescription: { type: String },
    
    baseAmount: { type: Number, required: true },
    gstPercentage: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    isGstInclusive: { type: Boolean, default: false },
    totalAmount: { type: Number, required: true }, // Formal total with GST
    
    amountPaid: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Partially Paid', 'Paid'],
      default: 'Unpaid',
    },
    notes: { type: String },
    terms: { type: String },
    bankDetails: {
      accountName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      bankName: { type: String },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;


