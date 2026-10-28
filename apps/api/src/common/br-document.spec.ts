import { isValidBrDocument, isValidCnpj, isValidCpf, onlyDigits } from './br-document';

describe('br-document', () => {
  it('normalizes to digits', () => {
    expect(onlyDigits('11.222.333/0001-81')).toBe('11222333000181');
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
  });

  it('accepts valid CPFs, formatted or not', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('rejects CPFs with a wrong check digit, wrong length or repeated digits', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('accepts valid CNPJs, formatted or not', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('00.000.000/0001-91')).toBe(true);
  });

  it('rejects CNPJs with a wrong check digit, wrong length or repeated digits', () => {
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('accepts either kind through isValidBrDocument', () => {
    expect(isValidBrDocument('529.982.247-25')).toBe(true);
    expect(isValidBrDocument('11.222.333/0001-81')).toBe(true);
    expect(isValidBrDocument('123')).toBe(false);
  });
});
