import { ageOn, classSuffix, className, gradeLabel, nextGrade, offersAllowed, planRollover, taskState } from './school-rules';

describe('séries e turmas (ADR 0020)', () => {
  it('nomeia séries do fundamental e do médio', () => {
    expect(gradeLabel('1')).toBe('1º ano');
    expect(gradeLabel('9')).toBe('9º ano');
    expect(gradeLabel('m1')).toBe('1ª série do médio');
  });
  it('a série seguinte do 9º ano é a 1ª do médio, e a 3ª do médio não tem seguinte', () => {
    expect(nextGrade('5')).toBe('6');
    expect(nextGrade('9')).toBe('m1');
    expect(nextGrade('m3')).toBeNull();
  });
  it('monta e desmonta o nome da turma', () => {
    expect(className('2', 'B')).toBe('2º ano B');
    expect(classSuffix('2', '2º ano B')).toBe('B');
    expect(classSuffix('m1', '1ª série do médio Manhã')).toBe('Manhã');
    expect(classSuffix('3', 'Turma do Sol')).toBe('Turma do Sol');
  });
});

describe('virada de ano', () => {
  const classes = [
    { id: 'c1a', name: '1º ano A', grade: '1' as const, studentIds: ['ana', 'bia', 'caio'] },
    { id: 'c2a', name: '2º ano A', grade: '2' as const, studentIds: ['duda'] },
    { id: 'cm3', name: '3ª série do médio A', grade: 'm3' as const, studentIds: ['eva', 'fabio'] },
  ];

  it('processa da série mais alta para a mais baixa', () => {
    const plan = planRollover(classes);
    expect(plan.steps.map((s) => s.fromClassId)).toEqual(['cm3', 'c2a', 'c1a']);
  });
  it('leva cada turma para a de mesma letra da série seguinte', () => {
    const plan = planRollover(classes);
    const s1 = plan.steps.find((s) => s.fromClassId === 'c1a')!;
    expect(s1.toGrade).toBe('2');
    expect(s1.toName).toBe('2º ano A');
    expect(s1.move).toEqual(['ana', 'bia', 'caio']);
  });
  it('quem repete fica na turma atual', () => {
    const plan = planRollover(classes, ['bia']);
    const s1 = plan.steps.find((s) => s.fromClassId === 'c1a')!;
    expect(s1.move).toEqual(['ana', 'caio']);
    expect(s1.keep).toEqual(['bia']);
    expect(plan.kept).toBe(1);
  });
  it('a 3ª série do médio se forma: sai da turma sem ir para outra', () => {
    const plan = planRollover(classes);
    const sm3 = plan.steps.find((s) => s.fromClassId === 'cm3')!;
    expect(sm3.toGrade).toBeNull();
    expect(sm3.toName).toBeNull();
    expect(plan.graduated).toBe(2);
    expect(plan.moved).toBe(4);
  });
});

describe('situação do aluno na tarefa', () => {
  it('concluída, atrasada ou pendente; tarefa sem prazo nunca atrasa', () => {
    expect(taskState(1, '2026-11-01', '2026-11-26')).toBe('DONE');
    expect(taskState(0.5, '2026-11-25', '2026-11-26')).toBe('LATE');
    expect(taskState(0.5, '2026-11-26', '2026-11-26')).toBe('PENDING');
    expect(taskState(0, null, '2030-01-01')).toBe('PENDING');
  });
});

describe('ofertas do Premium para menores', () => {
  const hoje = new Date('2026-11-26T12:00:00Z');
  it('calcula a idade completa', () => {
    expect(ageOn(new Date('2014-11-26T00:00:00Z'), hoje)).toBe(12);
    expect(ageOn(new Date('2014-11-27T00:00:00Z'), hoje)).toBe(11);
  });
  it('criança (até 11 anos) não vê oferta', () => {
    expect(offersAllowed(new Date('2016-05-01T00:00:00Z'), false, hoje)).toBe(false);
  });
  it('adolescente e adulto fora da escola veem', () => {
    expect(offersAllowed(new Date('2012-01-01T00:00:00Z'), false, hoje)).toBe(true);
    expect(offersAllowed(new Date('1990-01-01T00:00:00Z'), false, hoje)).toBe(true);
  });
  it('na escola ninguém vê oferta, e sem data de nascimento também não', () => {
    expect(offersAllowed(new Date('1990-01-01T00:00:00Z'), true, hoje)).toBe(false);
    expect(offersAllowed(null, false, hoje)).toBe(false);
  });
});
