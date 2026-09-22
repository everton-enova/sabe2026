"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import banks from "@/data/banks.json";
import data from "@/data/sabe.json";

import { Coordinator, Details, detailLabels, emptyDetails } from "@/lib/cp";
import { BotCheck } from "@/components/bot-check";

type Mode = "cp" | "sm";
type Stage = "selection" | "candidate" | "conference" | "form" | "review" | "success";
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
  const [action, setAction] = useState<"validar" | "editar" | "alterar" | "cadastrar">(isCp ? "validar" : "cadastrar");
  const [accepted, setAccepted] = useState(false);
  const [bankChoice, setBankChoice] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const busy = useRef(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [edited, setEdited] = useState(false);
  const [additional, setAdditional] = useState<Coordinator["adicionais"]>([]);
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
  const stageNumber = stage === "selection" ? 1 : stage === "candidate" || stage === "conference" || stage === "form" ? 2 : 3;

  async function selectLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!nte || !place || busy.current) return;
    const locked = window.localStorage.getItem(`sabe2026:${mode}:${nte}:${place}`);
    if (locked) {
      setMessage("Este formulário já foi concluído neste dispositivo e não está mais disponível para alteração.");
      return;
    }
    if (isCp) {
      busy.current = true;
      setLoadingCandidate(true);
      try {
        const response = await fetch("/api/indicacoes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nte, polo: place, turnstileToken }),
          cache: "no-store", signal: AbortSignal.timeout(30000),
        });
        const result = (await response.json()) as Coordinator & { message?: string };
        if (!response.ok) throw new Error(result.message || "Não foi possível localizar a indicação.");
        setCoordinator(result);
        setStage("candidate");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível localizar a indicação.");
      } finally {
        busy.current = false;
        setLoadingCandidate(false);
        setTurnstileToken("");
        setChallenge(value => value + 1);
      }
    } else {
      setStage("form");
    }
  }

  function openForm(newAction: "validar" | "alterar") {
    setAction(newAction);
    const initial = newAction === "validar" && coordinator
      ? Object.fromEntries(Object.keys(emptyDetails).map(key => [key, coordinator[key as keyof Details] || ""])) as Details
      : { ...emptyDetails };
    setDetails(initial);
    setAdditional(newAction === "validar" ? coordinator?.adicionais || [] : []);
    setBankChoice(initial.banco);
    setBankSearch(initial.banco);
    setEdited(false);
    setAccepted(false);
    setMessage("");
    setStage(newAction === "validar" ? "conference" : "form");
  }

  function editCurrent() {
    setAction("editar");
    setAccepted(false);
    setStage("form");
  }

  function reviewForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if ((action !== "editar" || details.banco.trim()) && (!bankChoice || (bankChoice === "__outro__" && !details.banco.trim()))) {
      setMessage("Selecione um banco da lista ou use a opção para digitar outro banco.");
      return;
    }
    if (!validCpf(details.cpf)) {
      setMessage("Confira o CPF informado. Ele precisa ser válido.");
      return;
    }
    if ((action !== "editar" || details.telefone.trim()) && ![10, 11].includes(onlyDigits(details.telefone).length)) {
      setMessage("Informe um telefone com DDD.");
      return;
    }
    if (isCp && action === "alterar" && onlyDigits(details.cpf) === onlyDigits(coordinator?.cpf || "")) {
      setMessage("Para manter a mesma pessoa, use Editar Dados. A substituição exige outro CPF.");
      return;
    }
    setAccepted(false);
    if (isCp && action === "editar") { setEdited(true); setStage("conference"); }
    else setStage("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!accepted || busy.current) return;
    busy.current = true;
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
          ...(isCp ? { registro: coordinator?.registro, versao: coordinator?.versao } : {}),
          turnstileToken,
          ...(action === "editar" ? { adicionais: additional } : {}),
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Não foi possível concluir o envio.");
      window.localStorage.setItem(`sabe2026:${mode}:${nte}:${place}`, new Date().toISOString());
      setStage("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir o envio.");
    } finally {
      busy.current = false;
      setSubmitting(false);
      setTurnstileToken("");
      setChallenge(value => value + 1);
    }
  }

  function resetSelection() {
    setStage("selection");
    setEdited(false);
    setAction(isCp ? "validar" : "cadastrar");
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
        <h1>{isCp ? "Coordenador de Polo" : "Supervisor Municipal"}</h1>
        <div className="intro-copy"><p className="eyebrow">SABE 2026</p><p className="lead">
          {isCp
            ? "Selecione o NTE e o polo para conferir a indicação, corrigir dados ou indicar outro coordenador."
            : "Selecione o NTE e o município antes de informar os dados do supervisor responsável."}
        </p></div>
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
          <form onSubmit={selectLocation} aria-busy={loadingCandidate}>
            <div className="section-heading"><span>01</span><div><h2>Identifique o local</h2><p>As opções seguem a relação oficial da planilha SABE 2026.</p></div></div>
            <div className="field-grid">
              <label>NTE<select disabled={loadingCandidate} value={nte} onChange={(event) => { setNte(event.target.value); setPlace(""); setMessage(""); }} required><option value="">Selecione o NTE</option>{ntes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>{placeLabel}<select value={place} onChange={(event) => { setPlace(event.target.value); setMessage(""); }} disabled={!nte || loadingCandidate} required><option value="">Selecione {isCp ? "o polo" : "o município"}</option>{places.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            {isCp && <BotCheck key={challenge} action="consulta_cp" onToken={setTurnstileToken} />}
            {loadingCandidate && <p role="status">Consultando a indicação do polo…</p>}
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions"><button className="button primary" type="submit" disabled={!nte || !place || loadingCandidate || (isCp && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)}>{loadingCandidate ? "Consultando..." : isCp ? "Consultar" : "Continuar"} {!loadingCandidate && <span>→</span>}</button></div>
          </form>
        )}

        {stage === "candidate" && coordinator && (
          <div>
            <div className="section-heading"><span>02</span><div><h2>Confirme a indicação</h2><p>Verifique se a pessoa indicada continua responsável pelo polo.</p></div></div>
            <div className="location-summary"><span>{nte}</span><strong>{place}</strong><button type="button" onClick={resetSelection}>Trocar polo</button></div>
            <dl className="candidate-data"><div><dt>Nome indicado</dt><dd>{coordinator.nome}</dd></div><div><dt>CPF</dt><dd>{"•••.•••.•••-" + onlyDigits(coordinator.cpf).slice(-2)}</dd></div></dl>
            <p className="notice"><strong>Atenção:</strong> confira os dados antes de validar. Use Alterar Coordenador de Polo somente para indicar outra pessoa.</p>
            <div className="form-actions split"><button className="button secondary" type="button" onClick={resetSelection}>Voltar</button><div className="action-group"><button className="button secondary" type="button" onClick={() => openForm("alterar")}>Alterar Coordenador de Polo</button><button className="button primary" type="button" onClick={() => openForm("validar")}>Validar Indicação <span>→</span></button></div></div>
          </div>
        )}

        {stage === "conference" && coordinator && (
          <div>
            <div className="section-heading"><span>02</span><div><h2>Coordenador de Polo indicado</h2><p>Confira as informações cadastradas antes de validar a indicação.</p></div></div>
            <dl className="candidate-data">
              <div><dt>NTE</dt><dd>{nte}</dd></div><div><dt>Polo</dt><dd>{place}</dd></div>
              <div><dt>Municípios do polo</dt><dd>{unique(data.locations.filter(item => item.nte === nte && item.polo === place).map(item => item.municipio)).join(", ") || "Não informado"}</dd></div>
              {Object.entries(details).map(([key, value]) => <div key={key}><dt>{detailLabels[key as keyof Details]}</dt><dd>{value || "Não informado"}</dd></div>)}
              {additional.map((item, index) => <div key={index}><dt>{item.campo}</dt><dd>{item.valor || "Não informado"}</dd></div>)}
            </dl>
            {edited && <p role="status" className="notice">Correções preparadas. Confira os dados e valide para concluir o envio.</p>}
            <div className="form-actions split"><button type="button" className="button secondary" onClick={() => setStage("candidate")}>Voltar</button><div className="action-group"><button type="button" className="button secondary" onClick={editCurrent}>Editar Dados</button><button type="button" className="button primary" onClick={() => { setAccepted(false); setTurnstileToken(""); setStage("review"); }}>Validar Indicação</button></div></div>
          </div>
        )}

        {stage === "form" && (
          <form onSubmit={reviewForm}>
            <div className="section-heading"><span>02</span><div><h2>{isCp ? action === "alterar" ? "Indicar outro Coordenador de Polo" : "Editar Dados" : "Dados do responsável"}</h2><p>{isCp && action === "editar" ? "Corrija os dados desta indicação. O coordenador continua vinculado ao mesmo registro." : "Preencha os dados da pessoa responsável. Revise antes de enviar."}</p></div></div>
            <div className="location-summary"><span>{nte}</span><strong>{place}</strong><button type="button" onClick={resetSelection}>Trocar {placeLabel.toLowerCase()}</button></div>
            <fieldset><legend>Dados pessoais</legend><div className="field-grid">
              <label className="wide">Nome completo<input name="nome" autoComplete="name" value={details.nome} onChange={(event) => setDetails({ ...details, nome: event.target.value })} required /></label>
              <label>E-mail<input name="email" type="email" autoComplete="email" value={details.email} onChange={(event) => setDetails({ ...details, email: event.target.value })} required={action !== "editar"} /></label>
              <label>Telefone<input name="telefone" type="tel" inputMode="tel" autoComplete="tel" value={details.telefone} onChange={(event) => setDetails({ ...details, telefone: formatPhone(event.target.value) })} placeholder="(71) 99999-9999" required={action !== "editar"} /></label>
              <label>CPF<input name="cpf" inputMode="numeric" autoComplete="off" value={details.cpf} onChange={(event) => setDetails({ ...details, cpf: formatCpf(event.target.value) })} placeholder="000.000.000-00" required /></label>
            </div></fieldset>
            <fieldset><legend>Dados bancários</legend><p className="field-help">A conta deve estar no nome do responsável informado acima.</p><div className="field-grid">
              {bankChoice === "__outro__" ? (
                <label>Banco não encontrado<input name="banco" value={details.banco} onChange={(event) => setDetails({ ...details, banco: event.target.value })} placeholder="Digite o nome ou número do banco" autoComplete="organization" required={action !== "editar"} /><button className="bank-other" type="button" onClick={() => { setBankChoice(""); setBankSearch(""); setDetails({ ...details, banco: "" }); }}>Voltar para a lista de bancos</button></label>
              ) : (
                <label className="bank-search-field">Banco<input name="bancoBusca" value={bankChoice || bankSearch} onChange={(event) => { const value = event.target.value; setBankChoice(""); setBankSearch(value); setDetails({ ...details, banco: "" }); }} placeholder="Digite o nome ou código do banco" autoComplete="off" required={action !== "editar"} />{matchingBanks.length > 0 && <div className="bank-options" role="listbox" aria-label="Bancos encontrados">{matchingBanks.map((bank) => { const value = `${bank.codigo} - ${bank.nome}`; return <button type="button" role="option" aria-selected="false" key={value} onClick={() => { setBankSearch(value); setBankChoice(value); setDetails({ ...details, banco: value }); }}>{value}</button>; })}</div>}<button className="bank-other" type="button" onClick={() => { setBankChoice("__outro__"); setBankSearch(""); setDetails({ ...details, banco: "" }); }}>Não encontrou? Digitar outro banco</button></label>
              )}
              <label>Agência<input name="agencia" inputMode="numeric" value={details.agencia} onChange={(event) => setDetails({ ...details, agencia: event.target.value })} required={action !== "editar"} /></label>
              <label>Conta corrente<input name="conta" value={details.conta} onChange={(event) => setDetails({ ...details, conta: event.target.value })} required={action !== "editar"} /></label>
              <label>Chave Pix<input name="pix" value={details.pix} onChange={(event) => setDetails({ ...details, pix: event.target.value })} placeholder="CPF, e-mail, telefone ou aleatória" required={action !== "editar"} /></label>
            </div></fieldset>
            {isCp && action === "editar" && additional.length > 0 && <fieldset><legend>Informações adicionais</legend><div className="field-grid">{additional.map((item, index) => <label key={index}>{item.campo}<input value={item.valor} maxLength={1000} onChange={event => setAdditional(previous => previous.map((entry, position) => position === index ? { ...entry, valor: event.target.value } : entry))} /></label>)}</div></fieldset>}
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions split"><button className="button secondary" type="button" onClick={() => { if (isCp) { if (action === "editar" && coordinator) { openForm("validar"); } else setStage("candidate"); } else resetSelection(); }}>Cancelar</button><button className="button primary" type="submit">{isCp && action === "editar" ? "Conferir correções" : "Revisar dados"} <span>→</span></button></div>
          </form>
        )}

        {stage === "review" && (
          <div>
            <div className="section-heading"><span>03</span><div><h2>Revise antes de enviar</h2><p>Depois da confirmação, este formulário ficará indisponível para alterações.</p></div></div>
            <div className="review-block"><h3>Localização</h3><dl><div><dt>NTE</dt><dd>{nte}</dd></div><div><dt>{placeLabel}</dt><dd>{place}</dd></div></dl></div>
            <div className="review-block"><h3>{isCp && action === "validar" ? "Indicação validada" : "Responsável"}</h3><dl>{Object.entries(details).map(([key, value]) => <div key={key}><dt>{detailLabels[key as keyof Details]}</dt><dd>{value || "Não informado"}</dd></div>)}</dl></div>
            {isCp && action !== "alterar" && additional.length > 0 && <div className="review-block"><h3>Informações adicionais</h3><dl>{additional.map((item, index) => <div key={index}><dt>{item.campo}</dt><dd>{item.valor || "Não informado"}</dd></div>)}</dl></div>}
            <BotCheck key={challenge} action="envio" onToken={setTurnstileToken} />
            <label className="confirmation"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Confirmo que revisei os dados e estou ciente de que não poderei alterá-los após o envio.</span></label>
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions split"><button className="button secondary" type="button" disabled={submitting} onClick={() => { setAccepted(false); setStage(isCp && (action === "validar" || action === "editar") ? "conference" : "form"); }}>Voltar e corrigir</button><button className="button primary" type="button" disabled={!accepted || submitting || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)} onClick={submit}>{submitting ? "Enviando..." : "Confirmar e enviar"}</button></div>
          </div>
        )}

        {stage === "success" && (
          <div className="success-state"><span className="success-icon">✓</span><p className="eyebrow">Envio concluído</p><h2>Dados confirmados</h2><p>O registro de {place} foi recebido. Como combinado, ele não está mais disponível para alteração.</p></div>
        )}
      </section>
    </main>
  );
}
