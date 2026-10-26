const{Router}=require('express');const controller=require('../controllers/eventBudgetController');
const auth=require('../middlewares/authMiddleware');const requireRole=require('../middlewares/requireRole');const validate=require('../middlewares/validate');const{eventBudgetItemSchema}=require('../validations/eventValidation');
const router=Router();router.use(auth,requireRole(['ADMIN','MANAGER']));router.patch('/:id',validate(eventBudgetItemSchema),controller.updateItem);router.delete('/:id',controller.removeItem);module.exports=router;
