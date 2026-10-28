import { renderTemplate, retryDelayMs } from './campaign-template';

describe('renderTemplate', () => {
  const lead = { firstName: 'Ana', companyName: 'Padaria Sol', email: 'ana@sol.test', jobTitle: null };

  it('replaces known variables, tolerating spaces', () => {
    expect(renderTemplate('Olá {{firstName}}, da {{ companyName }}!', lead)).toBe('Olá Ana, da Padaria Sol!');
  });

  it('turns missing, null and unknown variables into an empty string', () => {
    expect(renderTemplate('[{{lastName}}][{{jobTitle}}][{{nope}}]', lead)).toBe('[][][]');
  });

  it('does not read arbitrary properties', () => {
    expect(renderTemplate('{{constructor}} {{toString}} {{hasOwnProperty}}', lead)).toBe('  ');
  });

  it('leaves text without variables untouched', () => {
    expect(renderTemplate('sem variáveis {1} {{', lead)).toBe('sem variáveis {1} {{');
  });
});

describe('retryDelayMs', () => {
  it('doubles from one minute', () => {
    expect([1, 2, 3, 4].map((attempt) => retryDelayMs(attempt))).toEqual([60_000, 120_000, 240_000, 480_000]);
  });
});
