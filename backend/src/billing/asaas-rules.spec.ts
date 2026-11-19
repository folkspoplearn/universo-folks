import { addInterval, brMidnight, validDocument } from './asaas.service';

describe('validDocument (CPF/CNPJ antes de ir ao Asaas)', () => {
  it('aceita CPF e CNPJ com dígitos verificadores certos, com ou sem máscara', () => {
    expect(validDocument('529.982.247-25')).toBe(true);
    expect(validDocument('52998224725')).toBe(true);
    expect(validDocument('11.222.333/0001-81')).toBe(true);
  });
  it('recusa dígito errado, números repetidos e tamanho errado', () => {
    expect(validDocument('529.982.247-24')).toBe(false);
    expect(validDocument('111.111.111-11')).toBe(false);
    expect(validDocument('11.222.333/0001-80')).toBe(false);
    expect(validDocument('1234567890')).toBe(false);
  });
});

describe('período da assinatura', () => {
  it('termina à meia-noite de Brasília do vencimento + intervalo', () => {
    const end = addInterval(brMidnight('2026-11-18'), 'MONTHLY');
    expect(end.toISOString()).toBe('2026-12-18T03:00:00.000Z');
    // no horário de Brasília é 18/12 00:00, então "Renova em" mostra 18/12 (e não 17/12)
    expect(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(end)).toBe('18/12/2026');
    expect(addInterval(brMidnight('2026-11-18'), 'YEARLY').toISOString()).toBe('2027-11-18T03:00:00.000Z');
  });
});
