"use client";

import { FormEvent, useMemo, useState } from "react";
import banks from "@/data/banks.json";
import data from "@/data/sabe.json";

type Mode = "cp" | "sm";
type Stage = "selection" | "candidate" | "form" | "review" | "success";
type Coordinator = { nome: string; cpf: string };

type Details = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  banco: string;
  agencia: string;
  conta: string;
  pix: string;
};

const emptyDetails: Details = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  banco: "",
  agencia: "",
  conta: "",
  pix: "",
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function formatCpf(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function validCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (length: number) => {
    const sum = cpf.slice(0, length).split("").reduce((total, number, index) => total + Number(number) * (length + 1 - index), 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export function ApplicationForm({ mode }: { mode: Mode }) {
  const isCp = mode === "cp";
  const [stage, setStage] = useState<Stage>("selection");
  const [nte, setNte] = useState("");
  const [place, setPlace] = useState("");
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [action, setAction] = useState<"validar" | "alterar" | "cadastrar">(isCp ? "validar" : "cadastrar");
  const [accepted, setAccepted] = useState(false);
  const [bankChoice, setBankChoice] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const [message, setMessage] = useState("");

  const ntes = useMemo(
    () => unique((isCp ? data.coordinators : data.locations).map((item) => item.nte)),
    [isCp],
  );

  const places = useMemo(() => {
    if (!nte) return [];
    return unique(
      (isCp ? data.coordinators.filter((item) => item.nte === nte).map((item) => item.polo) : data.locations.filter((item) => item.nte === nte).map((item) => item.municipio)),
    );
  }, [isCp, nte]);

  const matchingBanks = useMemo(() => {
    const query = bankSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query || bankChoice) return [];
    return banks.filter((bank) => `${bank.codigo} - ${bank.nome}`.toLocaleLowerCase("pt-BR").includes(query)).slice(0, 12);
  }, [bankChoice, bankSearch]);

  const [coordinator, setCoordinator] = useState<Coordinator | undefined>();

  const placeLabel = isCp ? "Polo" : "Município";
  const stageNumber = stage === "selection" ? 1 : stage === "candidate" || stage === "form" ? 2 : 3;

  async function selectLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!nte || !place) return;
    const locked = window.localStorage.getItem(`sabe2026:${mode}:${nte}:${place}`);
    if (locked) {
      setMessage("Este formulário já foi concluído neste dispositivo e não está mais disponível para alteração.");
      return;
    }
    if (isCp) {
      setLoadingCandidate(true);
      try {
        const response = await fetch(`/api/indicacoes?nte=${encodeURIComponent(nte)}&polo=${encodeURIComponent(place)}`, { cache: "no-store" });
        const result = (await response.json()) as Coordinator & { message?: string };
        if (!response.ok) throw new Error(result.message || "Não foi possível localizar a indicação.");
        setCoordinator({ nome: result.nome, cpf: result.cpf });
        setStage("candidate");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível localizar a indicação.");
      } finally {
        setLoadingCandidate(false);
      }
    } else {
      setStage("form");
    }
  }

  function openEditForm() {
    setAction("alterar");
    setDetails({
      nome: coordinator?.nome ?? "",
      email: "",
      telefone: "",
      cpf: formatCpf(coordinator?.cpf ?? ""),
      banco: "",
      agencia: "",
      conta: "",
      pix: "",
    });
    setBankChoice("");
    setBankSearch("");
    setStage("form");
  }

  function reviewForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!bankChoice || (bankChoice === "__outro__" && !details.banco.trim())) {
      setMessage("Selecione um banco da lista ou use a opção para digitar outro banco.");
      return;
    }
    if (!validCpf(details.cpf)) {
      setMessage("Confira o CPF informado. Ele precisa ser válido.");
      return;
    }
    if (onlyDigits(details.telefone).length < 10) {
      setMessage("Informe um telefone com DDD.");
      return;
    }
    setStage("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!accepted || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/inscricoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modalidade: mode.toUpperCase(),
          acao: action,
          nte,
          local: place,
          ...details,
          ...(isCp && action === "validar" ? { nome: coordinator?.nome, cpf: coordinator?.cpf } : {}),
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Não foi possível concluir o envio.");
      window.localStorage.setItem(`sabe2026:${mode}:${nte}:${place}`, new Date().toISOString());
      setStage("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir o envio.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetSelection() {
    setStage("selection");
    setPlace("");
    setDetails(emptyDetails);
    setBankChoice("");
    setBankSearch("");
    setCoordinator(undefined);
    setAccepted(false);
    setMessage("");
  }

  return (
    <main className="form-page">
      <section className="form-intro">
        <p className="eyebrow">Aplicação {mode.toUpperCase()}</p>
        <h1>{isCp ? "Coordenador de Polo" : "Supervisor Municipal"}</h1>
        <p className="lead">
          {isCp
            ? "Selecione o NTE e o polo para validar a indicação existente ou atualizar os dados do coordenador."
            : "Selecione o NTE e o município antes de informar os dados do supervisor responsável."}
        </p>
      </section>

      {stage !== "success" && (
        <ol className="steps" aria-label="Etapas do formulário">
          {["Localização", isCp ? "Validação" : "Dados", "Revisão"].map((label, index) => (
            <li className={stageNumber >= index + 1 ? "active" : ""} key={label} aria-current={stageNumber === index + 1 ? "step" : undefined}>
              <span>{index + 1}</span>{label}
            </li>
          ))}
        </ol>
      )}

      <section className="form-shell" aria-live="polite">
        {stage === "selection" && (
          <form onSubmit={selectLocation}>
            <div className="section-heading"><span>01</span><div><h2>Identifique o local</h2><p>As opções seguem a relação oficial da planilha SABE 2026.</p></div></div>
            <div className="field-grid">
              <label>NTE<select value={nte} onChange={(event) => { setNte(event.target.value); setPlace(""); setMessage(""); }} required><option value="">Selecione o NTE</option>{ntes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>{placeLabel}<select value={place} onChange={(event) => { setPlace(event.target.value); setMessage(""); }} disabled={!nte} required><option value="">Selecione {isCp ? "o polo" : "o município"}</option>{places.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions"><button className="button primary" type="submit" disabled={!nte || !place || loadingCandidate}>{loadingCandidate ? "Consultando..." : "Continuar"} {!loadingCandidate && <span>→</span>}</button></div>
          </form>
        )}

        {stage === "candidate" && coordinator && (
          <div>
            <div className="section-heading"><span>02</span><div><h2>Confirme a indicação</h2><p>Verifique se a pessoa indicada continua responsável pelo polo.</p></div></div>
            <div className="location-summary"><span>{nte}</span><strong>{place}</strong><button type="button" onClick={resetSelection}>Trocar polo</button></div>
            <dl className="candidate-data"><div><dt>Nome indicado</dt><dd>{coordinator.nome}</dd></div><div><dt>CPF</dt><dd>{coordinator.cpf}</dd></div></dl>
            <p className="notice"><strong>Atenção:</strong> ao validar, você confirma os dados da pessoa indicada. Para informar outra pessoa ou corrigir os dados, escolha alterar.</p>
            <div className="form-actions split"><button className="button secondary" type="button" onClick={resetSelection}>Voltar</button><div className="action-group"><button className="button secondary" type="button" onClick={openEditForm}>Alterar dados</button><button className="button primary" type="button" onClick={() => { setAction("validar"); setStage("review"); }}>Validar indicação <span>→</span></button></div></div>
          </div>
        )}

        {stage === "form" && (
          <form onSubmit={reviewForm}>
            <div className="section-heading"><span>02</span><div><h2>Dados do responsável</h2><p>Preencha todos os campos. Eles não poderão ser alterados após o envio.</p></div></div>
            <div className="location-summary"><span>{nte}</span><strong>{place}</strong><button type="button" onClick={resetSelection}>Trocar {placeLabel.toLowerCase()}</button></div>
            <fieldset><legend>Dados pessoais</legend><div className="field-grid">
              <label className="wide">Nome completo<input name="nome" autoComplete="name" value={details.nome} onChange={(event) => setDetails({ ...details, nome: event.target.value })} required /></label>
              <label>E-mail<input name="email" type="email" autoComplete="email" value={details.email} onChange={(event) => setDetails({ ...details, email: event.target.value })} required /></label>
              <label>Telefone<input name="telefone" type="tel" inputMode="tel" autoComplete="tel" value={details.telefone} onChange={(event) => setDetails({ ...details, telefone: formatPhone(event.target.value) })} placeholder="(71) 99999-9999" required /></label>
              <label>CPF<input name="cpf" inputMode="numeric" autoComplete="off" value={details.cpf} onChange={(event) => setDetails({ ...details, cpf: formatCpf(event.target.value) })} placeholder="000.000.000-00" required /></label>
            </div></fieldset>
            <fieldset><legend>Dados bancários</legend><p className="field-help">A conta deve estar no nome do responsável informado acima.</p><div className="field-grid">
              {bankChoice === "__outro__" ? (
                <label>Banco não encontrado<input name="banco" value={details.banco} onChange={(event) => setDetails({ ...details, banco: event.target.value })} placeholder="Digite o nome ou número do banco" autoComplete="organization" required /><button className="bank-other" type="button" onClick={() => { setBankChoice(""); setBankSearch(""); setDetails({ ...details, banco: "" }); }}>Voltar para a lista de bancos</button></label>
              ) : (
                <label className="bank-search-field">Banco<input name="bancoBusca" value={bankChoice || bankSearch} onChange={(event) => { const value = event.target.value; setBankChoice(""); setBankSearch(value); setDetails({ ...details, banco: "" }); }} placeholder="Digite o nome ou código do banco" autoComplete="off" required />{matchingBanks.length > 0 && <div className="bank-options" role="listbox" aria-label="Bancos encontrados">{matchingBanks.map((bank) => { const value = `${bank.codigo} - ${bank.nome}`; return <button type="button" role="option" aria-selected="false" key={value} onClick={() => { setBankSearch(value); setBankChoice(value); setDetails({ ...details, banco: value }); }}>{value}</button>; })}</div>}<button className="bank-other" type="button" onClick={() => { setBankChoice("__outro__"); setBankSearch(""); setDetails({ ...details, banco: "" }); }}>Não encontrou? Digitar outro banco</button></label>
              )}
              <label>Agência<input name="agencia" inputMode="numeric" value={details.agencia} onChange={(event) => setDetails({ ...details, agencia: event.target.value })} required /></label>
              <label>Conta corrente<input name="conta" value={details.conta} onChange={(event) => setDetails({ ...details, conta: event.target.value })} required /></label>
              <label>Chave Pix<input name="pix" value={details.pix} onChange={(event) => setDetails({ ...details, pix: event.target.value })} placeholder="CPF, e-mail, telefone ou aleatória" required /></label>
            </div></fieldset>
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions split"><button className="button secondary" type="button" onClick={resetSelection}>Voltar</button><button className="button primary" type="submit">Revisar dados <span>→</span></button></div>
          </form>
        )}

        {stage === "review" && (
          <div>
            <div className="section-heading"><span>03</span><div><h2>Revise antes de enviar</h2><p>Depois da confirmação, este formulário ficará indisponível para alterações.</p></div></div>
            <div className="review-block"><h3>Localização</h3><dl><div><dt>NTE</dt><dd>{nte}</dd></div><div><dt>{placeLabel}</dt><dd>{place}</dd></div></dl></div>
            {isCp && action === "validar" ? (
              <div className="review-block"><h3>Indicação validada</h3><dl><div><dt>Nome</dt><dd>{coordinator?.nome}</dd></div><div><dt>CPF</dt><dd>{coordinator?.cpf}</dd></div></dl></div>
            ) : (
              <div className="review-block"><h3>Responsável</h3><dl>{Object.entries(details).map(([key, value]) => <div key={key}><dt>{{ nome: "Nome", email: "E-mail", telefone: "Telefone", cpf: "CPF", banco: "Banco", agencia: "Agência", conta: "Conta corrente", pix: "Chave Pix" }[key as keyof Details]}</dt><dd>{value}</dd></div>)}</dl></div>
            )}
            <label className="confirmation"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Confirmo que revisei os dados e estou ciente de que não poderei alterá-los após o envio.</span></label>
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions split"><button className="button secondary" type="button" onClick={() => setStage(isCp && action === "validar" ? "candidate" : "form")}>Voltar e corrigir</button><button className="button primary" type="button" disabled={!accepted || submitting} onClick={submit}>{submitting ? "Enviando..." : "Confirmar e enviar"}</button></div>
          </div>
        )}

        {stage === "success" && (
          <div className="success-state"><span className="success-icon">✓</span><p className="eyebrow">Envio concluído</p><h2>Dados confirmados</h2><p>O registro de {place} foi recebido. Como combinado, ele não está mais disponível para alteração.</p></div>
        )}
      </section>
    </main>
  );
}
