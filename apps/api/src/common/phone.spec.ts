import { digitsOf, phoneKey, toWhatsappNumber } from './phone';

describe('phone helpers', () => {
  it('keeps digits only', () => {
    expect(digitsOf('+55 (11) 99999-0000')).toBe('5511999990000');
    expect(digitsOf(null)).toBe('');
  });

  it('maps every common way of writing the same Brazilian mobile to one key', () => {
    const same = ['+55 (11) 99999-0000', '11999990000', '5511999990000', '(11) 9 9999-0000', '551199990000'];
    expect(new Set(same.map(phoneKey)).size).toBe(1);
  });

  it('tells different lines apart', () => {
    expect(phoneKey('11999990000')).not.toBe(phoneKey('11999990001'));
    expect(phoneKey('11999990000')).not.toBe(phoneKey('21999990000'));
  });

  it('handles landlines and foreign numbers without inventing digits', () => {
    expect(phoneKey('(11) 3333-4444')).toBe('551133334444');
    expect(phoneKey('+1 415 555 0100')).toBe('14155550100');
  });

  it('adds the Brazilian country code only when it is missing', () => {
    expect(toWhatsappNumber('(11) 99999-0000')).toBe('5511999990000');
    expect(toWhatsappNumber('+55 11 99999-0000')).toBe('5511999990000');
    expect(toWhatsappNumber('+1 415 555 0100')).toBe('14155550100');
  });
});
