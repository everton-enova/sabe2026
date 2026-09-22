<fieldset><legend>Dados bancários</legend>
  <p className="field-help">
    A conta bancária deve estar em nome do titular indicado acima. 
    Para contas poupança, será aceita exclusivamente a Caixa Econômica Federal. 
    Nesse caso, confira atentamente os dados da operação.
  </p>
  <div className="field-grid">
    
    {/* CAMPO: TIPO DE CONTA */}
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
            operacao: newTipo === "Poupança" ? details.operacao : "" // Limpa operação se não for poupança
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

    {/* CAMPO: BANCO */}
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
        <button className="bank-other" type="button" onClick={() => { 
          setBankChoice(""); 
          setBankSearch(""); 
          setDetails({ ...details, banco: "" }); 
        }}>
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
                <button 
                  type="button" 
                  role="option" 
                  aria-selected="false" 
                  key={value} 
                  onClick={() => { 
                    setBankSearch(value); 
                    setBankChoice(value); 
                    setDetails({ ...details, banco: value }); 
                  }}
                >
                  {value}
                </button>
              );
            })}
          </div>
        )}
        {details.tipoConta !== "Poupança" && (
          <button 
            className="bank-other" 
            type="button" 
            onClick={() => { 
              setBankChoice("__outro__"); 
              setBankSearch(""); 
              setDetails({ ...details, banco: "" }); 
            }}
          >
            Não encontrou? Digitar outro banco
          </button>
        )}
      </label>
    )}
    
    {/* CAMPOS: AGÊNCIA E CONTA */}
    <label>Agência
      <input 
        name="agencia" 
        inputMode="numeric" 
        value={details.agencia} 
        onChange={(event) => setDetails({ ...details, agencia: event.target.value })} 
        required={action !== "editar"} 
      />
    </label>
    <label>Conta
      <input 
        name="conta" 
        value={details.conta} 
        onChange={(event) => setDetails({ ...details, conta: event.target.value })} 
        required={action !== "editar"} 
      />
    </label>
    
    {/* CAMPO: VARIAÇÃO/OPERAÇÃO (SÓ APARECE PARA POUPANÇA) */}
        {details.tipoConta === "Poupança" && (
        <label>Variação/Operação
          <input 
            name="operacao" 
            value={details.operacao || ""} 
            onChange={(event) => setDetails({ ...details, operacao: event.target.value })} 
            required={action !== "editar"} 
            placeholder="Ex: 0001, 01, etc."
          />
        </label>
      )}
    
    {/* CAMPO: CHAVE PIX */}
    <label className="wide">Chave Pix
      <input 
        name="pix" 
        value={details.pix} 
        onChange={(event) => setDetails({ ...details, pix: event.target.value })} 
        placeholder="CPF, e-mail, telefone ou aleatória" 
        required={action !== "editar"} 
      />
    </label>
  </div>
</fieldset>