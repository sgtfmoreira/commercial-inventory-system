const{Router}=require('express');const controller=require('../controllers/eventBudgetController');
const auth=require('../middlewares/authMiddleware');const requireRole=require('../middlewares/requireRole');const validate=require('../middlewares/validate');const schemas=require('../validations/eventValidation');
const router=Router();router.use(auth,requireRole(['ADMIN','MANAGER']));
router.get('/:id/proposal.pdf',controller.getProposalPdf);router.get('/:id/proposal',controller.getProposal);router.get('/:id',controller.getById);router.patch('/:id',validate(schemas.updateEventBudgetSchema),controller.update);
router.post('/:id/recalculate',controller.recalculate);router.post('/:id/items',validate(schemas.eventBudgetItemSchema),controller.addItem);
router.post('/:id/send',controller.send);router.post('/:id/approve',controller.approve);
router.post('/:id/reject',validate(schemas.rejectEventBudgetSchema),controller.reject);router.post('/:id/new-revision',controller.newRevision);
module.exports=router;
