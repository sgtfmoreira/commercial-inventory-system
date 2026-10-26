const prisma = require('../utils/prisma');
const defaultRepository = require('../repositories/commercialEventRepository');
const AppError = require('../utils/AppError');

const cleanNullable = value => value == null || value === '' ? null : String(value).trim();

function createEventCustomerService({ repository = defaultRepository, database = prisma } = {}) {
    const getById = async (id, establishmentId, client) => {
        const customer = await repository.findCustomer(id, establishmentId, client);
        if (!customer) throw new AppError('Cliente de evento não encontrado.', 404);
        return customer;
    };
    return {
        async list(establishmentId, filters) {
            const skip = (filters.page - 1) * filters.pageSize;
            const [items, total] = await Promise.all([
                repository.listCustomers(establishmentId, { search: filters.search, skip, take: filters.pageSize }),
                repository.countCustomers(establishmentId, filters.search)
            ]);
            return { items, page: filters.page, pageSize: filters.pageSize, total };
        },
        getById,
        create(input, establishmentId) {
            return repository.createCustomer({
                establishmentId, name: input.name.trim(), document: cleanNullable(input.document),
                phone: cleanNullable(input.phone), email: cleanNullable(input.email), notes: cleanNullable(input.notes)
            });
        },
        async update(id, input, establishmentId) {
            await getById(id, establishmentId);
            const data = {};
            for (const field of ['name', 'document', 'phone', 'email', 'notes']) {
                if (input[field] !== undefined) data[field] = field === 'name' ? input[field].trim() : cleanNullable(input[field]);
            }
            await repository.updateCustomer(id, establishmentId, data);
            return getById(id, establishmentId);
        }
    };
}

module.exports = { ...createEventCustomerService(), createEventCustomerService };
