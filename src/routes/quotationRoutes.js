const express = require('express');
const router = express.Router();
const { 
  createQuotation, 
  getQuotations, 
  getQuotationById, 
  updateQuotation, 
  updateFulfillmentStatus, 
  updateEmiStatus, 
  deleteQuotation,
  getQuotationTerms,
  updateQuotationTerms
} = require('../controllers/quotationController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').get(protect, getQuotations).post(protect, createQuotation);
router.route('/terms/global')
  .get(protect, getQuotationTerms)
  .put(protect, admin, updateQuotationTerms);

router.route('/:id')
  .get(protect, getQuotationById)
  .put(protect, updateQuotation)
  .delete(protect, admin, deleteQuotation);
router.route('/:id/fulfillment').patch(protect, updateFulfillmentStatus);
router.route('/:id/emi-status').patch(protect, updateEmiStatus);

module.exports = router;
