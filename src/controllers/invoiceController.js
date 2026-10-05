const Invoice = require('../models/invoiceModel');
const Quotation = require('../models/quotationModel');

// @desc    Create a new invoice (from scratch or quotation)
// @route   POST /api/invoices
// @access  Private
const createInvoice = async (req, res) => {
  try {
    const { 
      leadId, quotationId, customInvoiceNo, invoiceNo: manualInvoiceNo, date, dueDate,
      systemSize, solarPanels, inverter, itemDescription, items,
      baseAmount, gstPercentage, amountPaid, bankDetails, isGstInclusive, notes, terms
    } = req.body;

    // Handle Custom Invoice Number or Auto generation
    let finalInvoiceNo = (manualInvoiceNo || customInvoiceNo || '').trim();
    if (!finalInvoiceNo) {
      const year = new Date().getFullYear();
      const lastInvoice = await Invoice.findOne({
          invoiceNo: new RegExp(`^(INV|EG|DEV)-${year}-`)
      }).sort({ invoiceNo: -1 });

      let nextNumber = 515;
      if (lastInvoice) {
          const lastNo = parseInt(lastInvoice.invoiceNo.split('-')[2]);
          if (lastInvoice.invoiceNo.startsWith('INV-')) {
              nextNumber = lastNo + 502; // Transition from INV-2026-0014 to DEV-2026-516
          } else {
              nextNumber = lastNo + 1;
          }
      }
      finalInvoiceNo = `DEV-${year}-${nextNumber}`;
    }

    // Process items if provided
    let processedItems = [];
    let calculatedBaseAmount = 0;

    if (Array.isArray(items) && items.length > 0) {
      processedItems = items.map(item => {
        const qty = Number(item.quantity) || 1;
        const rate = Number(item.rate) || 0;
        const amt = Number(item.amount) || (qty * rate);
        calculatedBaseAmount += amt;
        return {
          itemDescription: item.itemDescription || item.name || 'Product Item',
          hsnCode: item.hsnCode || '',
          quantity: qty,
          rate: rate,
          gstPercentage: Number(item.gstPercentage) || Number(gstPercentage) || 0,
          amount: amt
        };
      });
    }

    // Calculations
    const isInclusive = isGstInclusive === true || isGstInclusive === 'true';
    const gstPerc = isInclusive ? 8.9 : (Number(gstPercentage) || 0);

    const inputBaseAmount = calculatedBaseAmount > 0 ? calculatedBaseAmount : (Number(baseAmount) || 0);

    let gstAmount = 0;
    let totalAmount = 0;
    let storedBaseAmount = 0;

    if (isInclusive) {
      totalAmount = inputBaseAmount;
      gstAmount = (totalAmount * 8.9) / 108.9;
      storedBaseAmount = totalAmount - gstAmount;
    } else {
      storedBaseAmount = inputBaseAmount;
      gstAmount = (storedBaseAmount * gstPerc) / 100;
      totalAmount = storedBaseAmount + gstAmount;
    }

    const balanceAmount = totalAmount - Number(amountPaid || 0);
    
    let paymentStatus = 'Unpaid';
    if (amountPaid > 0) {
      paymentStatus = amountPaid >= totalAmount ? 'Paid' : 'Partially Paid';
    }

    const ownerId = req.user.role === 'admin' ? req.user._id : req.user.owner;

    const invoice = await Invoice.create({
      lead: leadId,
      quotation: quotationId,
      invoiceNo: finalInvoiceNo,
      date: date ? new Date(date) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      items: processedItems,
      systemSize: systemSize || 'N/A',
      solarPanels: solarPanels || 'N/A',
      inverter: inverter || 'N/A',
      itemDescription: itemDescription || (processedItems.length > 0 ? processedItems[0].itemDescription : 'DESIGN, SUPPLY & INSTALLATION OF SOLAR PV SYSTEM'),
      baseAmount: storedBaseAmount,
      gstPercentage: gstPerc,
      gstAmount,
      isGstInclusive: isInclusive,
      totalAmount,
      amountPaid: amountPaid || 0,
      balanceAmount,
      paymentStatus,
      notes,
      terms,
      bankDetails,
      createdBy: req.user._id,
      owner: ownerId,
    });

    // If created from quotation, mark quotation as converted
    if (quotationId) {
      await Quotation.findByIdAndUpdate(quotationId, { status: 'Converted' });
    }

    res.status(201).json(invoice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
const getInvoices = async (req, res) => {
  try {
    const ownerId = req.user.role === 'admin' ? req.user._id : req.user.owner;
    let query = { owner: ownerId };
    
    if (req.user.role !== 'admin') {
      const Lead = require('../models/leadModel');
      const leads = await Lead.find({ assignedTo: req.user._id }).select('_id');
      const leadIds = leads.map(l => l._id);
      query.$or = [
        { lead: { $in: leadIds } },
        { createdBy: req.user._id }
      ];
    }

    const invoices = await Invoice.find(query)
      .populate('lead', 'name email phone address personalInfo')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete an invoice
// @route   DELETE /api/invoices/:id
// @access  Private/Admin
const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Authorize: Admin only
    if (req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized to delete invoices' });
    }

    // If quotation is linked, revert its status to Pending
    if (invoice.quotation) {
      await Quotation.findByIdAndUpdate(invoice.quotation, { status: 'Pending' });
    }

    await Invoice.findByIdAndDelete(req.params.id);

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update an invoice
// @route   PUT /api/invoices/:id
// @access  Private/Admin
const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized to update invoice' });
    }

    const { 
      invoiceNo, date, dueDate, baseAmount, gstPercentage, isGstInclusive, 
      amountPaid, bankDetails, systemSize, solarPanels, inverter, 
      itemDescription, items, notes, terms 
    } = req.body;

    if (invoiceNo !== undefined && invoiceNo.trim()) {
      invoice.invoiceNo = invoiceNo.trim();
    }
    if (date !== undefined) invoice.date = new Date(date);
    if (dueDate !== undefined) invoice.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) invoice.notes = notes;
    if (terms !== undefined) invoice.terms = terms;

    let processedItems = [];
    let calculatedBaseAmount = 0;

    if (Array.isArray(items)) {
      processedItems = items.map(item => {
        const qty = Number(item.quantity) || 1;
        const rate = Number(item.rate) || 0;
        const amt = Number(item.amount) || (qty * rate);
        calculatedBaseAmount += amt;
        return {
          itemDescription: item.itemDescription || item.name || 'Product Item',
          hsnCode: item.hsnCode || '',
          quantity: qty,
          rate: rate,
          gstPercentage: Number(item.gstPercentage) || Number(gstPercentage) || 0,
          amount: amt
        };
      });
      invoice.items = processedItems;
    }

    const isInclusive = isGstInclusive !== undefined ? (isGstInclusive === true || isGstInclusive === 'true') : invoice.isGstInclusive;
    const gstPerc = isInclusive ? 8.9 : (gstPercentage !== undefined ? (Number(gstPercentage) || 0) : invoice.gstPercentage);

    let inputBaseAmt = 0;
    if (calculatedBaseAmount > 0) {
      inputBaseAmt = calculatedBaseAmount;
    } else if (baseAmount !== undefined) {
      inputBaseAmt = Number(baseAmount) || 0;
    } else {
      inputBaseAmt = invoice.isGstInclusive ? invoice.totalAmount : invoice.baseAmount;
    }

    let gstAmount = 0;
    let totalAmount = 0;
    let storedBaseAmount = 0;

    if (isInclusive) {
      totalAmount = Number(inputBaseAmt) || 0;
      gstAmount = (totalAmount * 8.9) / 108.9;
      storedBaseAmount = totalAmount - gstAmount;
    } else {
      storedBaseAmount = Number(inputBaseAmt) || 0;
      gstAmount = (storedBaseAmount * gstPerc) / 100;
      totalAmount = storedBaseAmount + gstAmount;
    }

    const paidAmt = amountPaid !== undefined ? Number(amountPaid) : invoice.amountPaid;
    const balanceAmount = totalAmount - paidAmt;
    
    let paymentStatus = 'Unpaid';
    if (paidAmt > 0) {
      paymentStatus = paidAmt >= totalAmount ? 'Paid' : 'Partially Paid';
    }

    invoice.baseAmount = storedBaseAmount;
    invoice.gstPercentage = gstPerc;
    invoice.gstAmount = gstAmount;
    invoice.isGstInclusive = isInclusive;
    invoice.totalAmount = totalAmount;
    invoice.amountPaid = paidAmt;
    invoice.balanceAmount = balanceAmount;
    invoice.paymentStatus = paymentStatus;
    
    if (bankDetails) invoice.bankDetails = bankDetails;
    if (systemSize !== undefined) invoice.systemSize = systemSize;
    if (solarPanels !== undefined) invoice.solarPanels = solarPanels;
    if (inverter !== undefined) invoice.inverter = inverter;
    if (itemDescription !== undefined) invoice.itemDescription = itemDescription;

    const updatedInvoice = await invoice.save();
    res.json(updatedInvoice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { createInvoice, getInvoices, deleteInvoice, updateInvoice };

