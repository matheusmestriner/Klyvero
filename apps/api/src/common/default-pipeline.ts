/** Sales pipeline every new workspace starts with. */
export const DEFAULT_PIPELINE = {
  name: 'Pipeline principal',
  isDefault: true,
  stages: {
    create: [
      { name: 'Novo', position: 1, probability: 10 },
      { name: 'Contato', position: 2, probability: 25 },
      { name: 'Qualificado', position: 3, probability: 50 },
      { name: 'Proposta', position: 4, probability: 75 },
      { name: 'Ganho', position: 5, probability: 100 },
    ],
  },
};
