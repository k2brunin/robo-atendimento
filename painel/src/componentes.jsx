// Componentes reaproveitados nas telas.
export function Variacoes({ valor, onChange, linhas = 2, max = 3, placeholder }) {
  const lista = [...(valor || [])];
  while (lista.length < max) lista.push('');
  return (
    <div className="grade" style={{ gap: 6 }}>
      {lista.slice(0, max).map((v, i) => (
        <textarea key={i} rows={linhas} value={v} placeholder={i === 0 ? (placeholder || 'Variação 1') : `Variação ${i + 1} (opcional)`}
          onChange={(e) => { const n = [...lista]; n[i] = e.target.value; onChange(n.filter((x, j) => x.trim() || j < 1)); }} />
      ))}
      <div className="ajuda">O robô sorteia uma das variações. Use <b>{'{nome}'}</b> para o primeiro nome do cliente.</div>
    </div>
  );
}

export function Interruptor({ valor, onChange }) {
  return <label className="interruptor"><input type="checkbox" checked={!!valor} onChange={(e) => onChange(e.target.checked)} /><span /></label>;
}

export function Palavras({ valor, onChange, placeholder }) {
  return (
    <textarea rows={3} placeholder={placeholder} value={(valor || []).join(', ')}
      onChange={(e) => onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
      onBlur={(e) => onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
  );
}
