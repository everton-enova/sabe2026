"use client";

import { FormEvent, useMemo, useRef, useState, useEffect } from "react";
import banks from "@/data/banks.json";
import data from "@/data/sabe.json";
import { BotCheck } from "@/components/bot-check";
import { Coordinator, Details, detailLabels, emptyDetails } from "@/lib/cp";

type Mode = "cp" | "sm";
type Stage = "selection" | "candidate" | "conference" | "form" | "review" | "success";

const onlyDigits = (value: string) => String(value || "").replace(/\D/g, "");

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

function normalized(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

// Chave NTE+polo para casar com a lista pre-carregada de polos ja validados.
const nteKey = (value: string) => String(Number(String(value || "").replace(/\D/g, "")));
const placeKey = (nte: string, polo: string) => `${nteKey(nte)}|${normalized(polo)}`;

function extractDigito(value: string): { principal: string; digito: string } {
  if (!value) return { principal: "", digito: "" };
  const partes = String(value).split(/[-–]/);
  if (partes.length === 2) {
    return { principal: partes[0].trim(), digito: partes[1].trim() };
  }
  return { principal: String(value).trim(), digito: "" };
}

// Lê a resposta com segurança (nunca deixa a página crashar)
type ServerResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  error?: string;
  validated?: unknown;
  nome?: string;
  registro?: string;
  [key: string]: unknown;
};

async function safeJson(res: Response): Promise<ServerResponse> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as ServerResponse : {};
  } catch {
    return { ok: false, code: "BAD_JSON", message: `Resposta inválida do servidor (status ${res.status}). Tente novamente.` };
  }
}

/* AbortSignal.timeout não existe em navegadores antigos; sem o fallback o próprio fetch
   estoura e a tela mostra "erro" em vez de tentar de novo. 45s cobre a leitura de 15s
   do webhook + o fallback público de 15s em lib/sheets.ts, com folga. */
const REQUEST_TIMEOUT = 45000;
function timeoutSignal(ms: number) {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function friendlyError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "A conexão demorou demais. Verifique a internet e tente novamente.";
    return error.message || fallback;
  }
  return fallback;
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
  const [loadingValidated, setLoadingValidated] = useState(isCp);
  const busy = useRef(false);
  const [edited, setEdited] = useState(false);
  const [additional, setAdditional] = useState<Coordinator["adicionais"]>([]);
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [botAttempt, setBotAttempt] = useState(0);
  const needsBotCheck = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const [validatedPlaces, setValidatedPlaces] = useState<string[]>([]);
  const [coordinator, setCoordinator] = useState<Coordinator | undefined>();

  const ntes = useMemo(
    () => unique((isCp ? data.coordinators : data.locations).map((item) => item.nte)),
    [isCp]
  );

  useEffect(() => {
    if (!isCp) return;
    const controller = new AbortController();
    let ativo = true;
    async function loadValidatedPlaces() {
      // Pre-carrega TODOS os polos validados de uma vez, antes de o usuario escolher o NTE.
      try {
        const response = await fetch(`/api/validacao-status?mode=${mode}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await safeJson(response);
        if (!ativo) return;
        const items = Array.isArray(result.validated) ? result.validated : [];
        setValidatedPlaces(items
          .map((item) => {
            if (item && typeof item === "object") {
              const entry = item as { nte?: unknown; polo?: unknown };
              if (typeof entry.polo === "string") return placeKey(String(entry.nte ?? ""), entry.polo);
            }
            return "";
          })
          .filter(Boolean));
      } catch {
        if (ativo) setValidatedPlaces([]);
      } finally {
        if (ativo) setLoadingValidated(false);
      }
    }
    loadValidatedPlaces();
    return () => { ativo = false; controller.abort(); };
  }, [isCp, mode]);

  const places = useMemo(() => {
    if (!nte) return [];
    const placesList = unique(
      (isCp ? data.coordinators.filter((item) => item.nte === nte).map((item) => item.polo) : data.locations.filter((item) => item.nte === nte).map((item) => item.municipio))
    );
    return placesList.map(p => ({
      name: p,
      isDisabled: validatedPlaces.includes(placeKey(nte, p))
    }));
  }, [isCp, nte, validatedPlaces]);

  const matchingBanks = useMemo(() => {
    const query = bankSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query || bankChoice) return [];
    const banksToSearch = details.tipoConta === "Poupança"
      ? banks.filter(b => b.codigo === "104" || b.nome.toLocaleLowerCase("pt-BR").includes("caixa"))
      : banks;
    return banksToSearch
      .filter((bank) => `${bank.codigo} - ${bank.nome}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 12);
  }, [bankChoice, bankSearch, details.tipoConta]);

  const placeLabel = isCp ? "Polo" : "Município";
  const stageNumber = stage === "selection" ? 1 : stage === "candidate" || stage === "conference" || stage === "form" ? 2 : 3;

  async function selectLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!nte || !place || busy.current) return;

    if (validatedPlaces.includes(placeKey(nte, place))) {
      setMessage("Este polo já foi validado e não está mais disponível para alteração.");
      return;
    }

    if (isCp) {
      busy.current = true;
      setLoadingCandidate(true);
      try {
        const response = await fetch("/api/indicacoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nte, polo: place }),
          cache: "no-store",
          signal: timeoutSignal(REQUEST_TIMEOUT),
        });
        const result = await safeJson(response);

        if (!response.ok || result.ok === false || (!result.nome && !result.registro)) {
          throw new Error(result.message || result.error || "Não foi possível localizar a indicação.");
        }

        setCoordinator(result as unknown as Coordinator);
        setStage("candidate");
      } catch (error) {
        setMessage(friendlyError(error, "Não foi possível localizar a indicação."));
      } finally {
        busy.current = false;
        setLoadingCandidate(false);
      }
    } else {
      setStage("form");
    }
  }

  function openForm(newAction: "validar" | "alterar") {
    setAction(newAction);

    const initial = newAction === "validar" && coordinator
      ? Object.fromEntries(Object.keys(emptyDetails).map(key => {
          const valor = String((coordinator as unknown as Record<string, unknown>)[key] || "");
          if (key === "agencia" || key === "conta") {
            return [key, extractDigito(valor).principal];
          }
          return [key, valor];
        })) as Details
      : { ...emptyDetails };

    if (coordinator && newAction === "validar") {
      initial.agenciaDigito = coordinator.agenciaDigito || extractDigito(coordinator.agencia || "").digito;
      initial.contaDigito = coordinator.contaDigito || extractDigito(coordinator.conta || "").digito;
    }

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
          ...(action === "editar" ? { adicionais: additional } : {}),
          turnstileToken,
        }),
        signal: timeoutSignal(REQUEST_TIMEOUT),
      });
      const result = await safeJson(response);
      if (!response.ok || result.ok === false) {
        throw new Error(result.message || result.error || "Não foi possível concluir o envio.");
      }
      setStage("success");
    } catch (error) {
      // Token do Turnstile e de uso unico: descarta e remonta o widget para o proximo envio.
      setTurnstileToken("");
      setBotAttempt(attempt => attempt + 1);
      setMessage(friendlyError(error, "Não foi possível concluir o envio."));
    } finally {
      busy.current = false;
      setSubmitting(false);
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

  const cpfMascarado = coordinator ? "•••.•••.•••-" + onlyDigits(coordinator.cpf).slice(-2) : "";

  return (
    <main className="form-page">
      <section className="form-intro">
        <h1>{isCp ? "Validação dos Coordenadores de Polo" : "Supervisor Municipal"}</h1>
        <div className="intro-copy">
          {isCp ? (
            <>
              <p className="lead">Prezado(a) Diretor(a),</p>
              <p>Este formulário tem como objetivo validar os dados dos Coordenadores de Polo que atuarão nas aplicações do SABE 2026, nas sedes de polo dos municípios pertencentes aos seus respectivos Núcleos Territoriais de Educação (NTE).</p>
              <p><strong>Para realizar o preenchimento:</strong></p>
              <ol>
                <li>Selecione o seu NTE.</li>
                <li>Selecione o município.</li>
                <li>Confira os dados apresentados dos Coordenadores de Polo que atuaram no SABE 2025 e verifique se permanecem para o SABE 2026.</li>
                <li>Caso as informações estejam corretas, realize a validação.</li>
                <li>Caso seja necessária a substituição do Coordenador de Polo, selecione a opção “Alterar Coordenador de Polo” e informe os dados da nova pessoa indicada.</li>
              </ol>
              <p><strong>Confira todas as informações antes de concluir o formulário.</strong></p>
            </>
          ) : (
            <>
              <p className="lead">Prezado(a) Gestor(a),</p>
              <p>Este formulário tem como objetivo cadastrar os dados do Supervisor Municipal que atuará nas aplicações do SABE 2026, representando o município junto aos Núcleos Territoriais de Educação (NTE).</p>
              <p><strong>Para realizar o preenchimento:</strong></p>
              <ol>
                <li>Selecione o seu NTE.</li>
                <li>Selecione o município.</li>
                <li>Informe os dados pessoais do Supervisor Municipal responsável.</li>
                <li>Informe os dados bancários para recebimento, se aplicável.</li>
                <li>Revise todas as informações antes de concluir o envio.</li>
              </ol>
              <p><strong>Confira todas as informações antes de concluir o formulário.</strong></p>
            </>
          )}
        </div>
      </section>

      {stage !== "success" && (
        <ol className="steps" aria-label="Etapas do formulário">
          {["Localização", isCp ? "Validação" : "Dados", "Revisão"].map((label, index) => (
            <li className={stageNumber >= index + 1 ? "active" : ""} key={label} aria-current={stageNumber === index + 1 ? "step" : undefined}>
              <span>{index + 1}</span> {label}
            </li>
          ))}
        </ol>
      )}

      <section className="form-shell" aria-live="polite">
        {stage === "selection" && (
          <form onSubmit={selectLocation} aria-busy={loadingCandidate || loadingValidated}>
            <div className="section-heading"><span>01</span><div><h2>Identifique o local</h2><p>As opções seguem a relação oficial da planilha SABE 2026.</p></div></div>
            {loadingValidated && (
              <p className="loading-line" role="status"><span className="spinner" aria-hidden="true" />Carregando os dados dos polos…</p>
            )}
            <div className="field-grid">
              <label>NTE
                <select disabled={loadingCandidate || loadingValidated} value={nte} onChange={(event) => { setNte(event.target.value); setPlace(""); setMessage(""); }} required>
                  <option value="">Selecione o NTE</option>
                  {ntes.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>{placeLabel}
                <select
                  value={place}
                  onChange={(event) => { setPlace(event.target.value); setMessage(""); }}
                  disabled={!nte || loadingCandidate || loadingValidated}
                  required
                >
                  <option value="">Selecione {isCp ? "o polo" : "o município"}</option>
                  {places.map((item) => (
                    <option key={item.name} value={item.name} disabled={item.isDisabled}>
                      {item.name}{item.isDisabled ? " ✓" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {loadingCandidate && <p role="status">Consultando a indicação do polo…</p>}
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions"><button className="button primary" type="submit" disabled={!nte || !place || loadingCandidate || loadingValidated}>{loadingCandidate ? "Consultando..." : isCp ? "Consultar" : "Continuar"}{!loadingCandidate && <span>→</span>}</button></div>
          </form>
        )}

        {stage === "candidate" && coordinator && (
          <div>
            <div className="section-heading"><span>02</span><div><h2>Confirme a indicação</h2><p>Verifique se a pessoa indicada continua responsável pelo polo.</p></div></div>
            <div className="location-summary"><span>{nte}</span><strong>{place}</strong><button type="button" onClick={resetSelection}>Trocar polo</button></div>
            <dl className="candidate-data">
              <div><dt>Nome indicado</dt><dd>{coordinator.nome || "Não informado"}</dd></div>
              <div><dt>CPF</dt><dd>{cpfMascarado}</dd></div>
            </dl>
            <p className="notice"><strong>Atenção:</strong> confira os dados antes de validar. A opção “Alterar Coordenador de Polo” deve ser utilizada exclusivamente para indicar outra pessoa.</p>
            <div className="form-actions split"><button className="button secondary" type="button" onClick={resetSelection}>Voltar</button><div className="action-group"><button className="button secondary" type="button" onClick={() => openForm("alterar")}>Alterar Coordenador de Polo</button><button className="button primary" type="button" onClick={() => openForm("validar")}>Validar Indicação <span>→</span></button></div></div>
          </div>
        )}

        {stage === "conference" && coordinator && (
          <div>
            <div className="section-heading"><span>02</span><div><h2>Coordenador de Polo indicado</h2><p>Confira as informações cadastradas antes de validar a indicação.</p></div></div>
            <dl className="candidate-data">
              <div><dt>NTE</dt><dd>{nte}</dd></div>
              <div><dt>Polo</dt><dd>{place}</dd></div>
              <div><dt>Municípios do polo</dt><dd>{unique(data.locations.filter(item => item.nte === nte && item.polo === place).map(item => item.municipio)).join(", ") || "Não informado"}</dd></div>
              {Object.entries(details).map(([key, value]) => <div key={key}><dt>{detailLabels[key as keyof Details] || key}</dt><dd>{value || "Não informado"}</dd></div>)}
            </dl>
            {edited && <p role="status" className="notice">Correções preparadas. Confira os dados e valide para concluir o envio.</p>}
            <div className="form-actions split"><button type="button" className="button secondary" onClick={() => setStage("candidate")}>Voltar</button><div className="action-group"><button type="button" className="button secondary" onClick={editCurrent}>Editar Dados</button><button type="button" className="button primary" onClick={() => { setAccepted(false); setStage("review"); }}>Validar Indicação</button></div></div>
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

            <fieldset><legend>Dados bancários</legend>
              <p className="field-help">
                A conta bancária deve estar em nome do titular indicado acima.
                Para contas poupança, será aceita exclusivamente a Caixa Econômica Federal.
                Nesse caso, confira atentamente os dados da operação.
              </p>
              <div className="field-grid">
                <label>Tipo de Conta
                  <select
                    name="tipoConta"
                    value={details.tipoConta || ""}
                    onChange={(event) => {
                      const newTipo = event.target.value;
                      setDetails({
                        ...details,
                        tipoConta: newTipo,
                        banco: newTipo === "Poupança" ? "104 - CAIXA ECONOMICA FEDERAL" : "",
                        operacao: newTipo === "Poupança" ? details.operacao : ""
                      });
                      if (newTipo === "Poupança") {
                        setBankChoice("104 - CAIXA ECONOMICA FEDERAL");
                        setBankSearch("104 - CAIXA ECONOMICA FEDERAL");
                      } else {
                        setBankChoice("");
                        setBankSearch("");
                      }
                    }}
                    required={action !== "editar"}
                  >
                    <option value="">Selecione o tipo de conta</option>
                    <option value="Corrente">Conta Corrente</option>
                    <option value="Poupança">Conta Poupança</option>
                  </select>
                </label>

                {bankChoice === "__outro__" ? (
                  <label className="wide">Banco não encontrado
                    <input
                      name="banco"
                      value={details.banco}
                      onChange={(event) => setDetails({ ...details, banco: event.target.value })}
                      placeholder="Digite o nome ou número do banco"
                      autoComplete="organization"
                      required={action !== "editar"}
                    />
                    <button className="bank-other" type="button" onClick={() => { setBankChoice(""); setBankSearch(""); setDetails({ ...details, banco: "" }); }}>
                      Voltar para a lista de bancos
                    </button>
                  </label>
                ) : (
                  <label className="bank-search-field wide">Banco
                    <input
                      name="bancoBusca"
                      value={bankChoice || bankSearch}
                      onChange={(event) => {
                        const value = event.target.value;
                        setBankChoice("");
                        setBankSearch(value);
                        setDetails({ ...details, banco: "" });
                      }}
                      placeholder="Digite o nome ou código do banco"
                      autoComplete="off"
                      required={action !== "editar"}
                      readOnly={details.tipoConta === "Poupança"}
                      style={details.tipoConta === "Poupança" ? { backgroundColor: "#f3f4f6", cursor: "not-allowed" } : {}}
                    />
                    {matchingBanks.length > 0 && details.tipoConta !== "Poupança" && (
                      <div className="bank-options" role="listbox" aria-label="Bancos encontrados">
                        {matchingBanks.map((bank) => {
                          const value = `${bank.codigo} - ${bank.nome}`;
                          return (
                            <button type="button" role="option" aria-selected="false" key={value} onClick={() => { setBankSearch(value); setBankChoice(value); setDetails({ ...details, banco: value }); }}>
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {details.tipoConta !== "Poupança" && (
                      <button className="bank-other" type="button" onClick={() => { setBankChoice("__outro__"); setBankSearch(""); setDetails({ ...details, banco: "" }); }}>
                        Não encontrou? Digitar outro banco
                      </button>
                    )}
                  </label>
                )}

                <label>Agência
                  <input name="agencia" inputMode="numeric" value={details.agencia} onChange={(event) => setDetails({ ...details, agencia: event.target.value })} required={action !== "editar"} placeholder="Ex: 3529" />
                </label>
                <label>Dígito Agência
                  <input name="agenciaDigito" inputMode="numeric" value={details.agenciaDigito || ""} onChange={(event) => setDetails({ ...details, agenciaDigito: event.target.value })} placeholder="Ex: 4" maxLength={2} />
                </label>
                <label>Conta
                  <input name="conta" value={details.conta} onChange={(event) => setDetails({ ...details, conta: event.target.value })} required={action !== "editar"} placeholder="Ex: 48678" />
                </label>
                <label>Dígito Conta
                  <input name="contaDigito" value={details.contaDigito || ""} onChange={(event) => setDetails({ ...details, contaDigito: event.target.value })} placeholder="Ex: 7" maxLength={2} />
                </label>

                {details.tipoConta === "Poupança" && (
                  <label>Variação/Operação
                    <input name="operacao" value={details.operacao || ""} onChange={(event) => setDetails({ ...details, operacao: event.target.value })} required={action !== "editar"} placeholder="Ex: 0001, 01, etc." />
                  </label>
                )}

                <label className="wide">Chave Pix
                  <input name="pix" value={details.pix} onChange={(event) => setDetails({ ...details, pix: event.target.value })} placeholder="CPF, e-mail, telefone ou aleatória" required={action !== "editar"} />
                </label>
              </div>
            </fieldset>

            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions split"><button className="button secondary" type="button" onClick={() => { if (isCp) { if (action === "editar" && coordinator) { openForm("validar"); } else setStage("candidate"); } else resetSelection(); }}>Cancelar</button><button className="button primary" type="submit">{isCp && action === "editar" ? "Conferir correções" : "Revisar dados"}<span>→</span></button></div>
          </form>
        )}

        {stage === "review" && (
          <div>
            <div className="section-heading"><span>03</span><div><h2>Revise antes de enviar</h2><p>Depois da confirmação, este formulário ficará indisponível para alterações.</p></div></div>
            <div className="review-block"><h3>Localização</h3><dl><div><dt>NTE</dt><dd>{nte}</dd></div><div><dt>{placeLabel}</dt><dd>{place}</dd></div></dl></div>
            <div className="review-block"><h3>{isCp && action === "validar" ? "Indicação validada" : "Responsável"}</h3><dl>{Object.entries(details).map(([key, value]) => <div key={key}><dt>{detailLabels[key as keyof Details] || key}</dt><dd>{value || "Não informado"}</dd></div>)}</dl></div>
            <label className="confirmation"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Confirmo que revisei os dados e estou ciente de que não poderei alterá-los após o envio.</span></label>
            {needsBotCheck && <BotCheck key={botAttempt} action="sabe-envio" onToken={setTurnstileToken} />}
            {message && <p className="form-message error" role="alert">{message}</p>}
            <div className="form-actions split"><button className="button secondary" type="button" disabled={submitting} onClick={() => { setAccepted(false); setStage(isCp && (action === "validar" || action === "editar") ? "conference" : "form"); }}>Voltar e corrigir</button><button className="button primary" type="button" disabled={!accepted || submitting || (needsBotCheck && !turnstileToken)} onClick={submit}>{submitting ? "Enviando..." : "Confirmar e enviar"}</button></div>
          </div>
        )}

        {stage === "success" && (
          <div className="success-state"><span className="success-icon">✓</span><p className="eyebrow">Envio concluído</p><h2>Dados confirmados</h2><p>O registro de {place} foi recebido e processado com sucesso.</p></div>
        )}
      </section>
    </main>
  );
}