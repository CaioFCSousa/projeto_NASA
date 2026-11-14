# SEESAW — Projeto NASA Space Apps 2026 (Trindade Full-Stack)

Nov 14, 2026&#32;

## 1. A ideia em resumo

**SEESAW — Earth's Opposite-Trend Detective** é uma ferramenta web que encontra "gangorras" no sistema terrestre: pares de regiões onde a mesma variável sobe de um lado e desce do outro, de forma estatisticamente significativa.

**Tagline:** *When one side of the Earth goes up, where does it go down?*

A frase mais importante do enunciado do desafio é a que quase toda equipe vai ignorar: uma variável pode ter tendência em um sentido numa região e no sentido oposto em outra, mesmo quando o mesmo processo causa as duas. O SEESAW transforma essa frase no produto.

O usuário faz três coisas:

1. **Escolhe uma variável** (temperatura, chuva, umidade do solo, radiação solar, vento) e um período.
2. **Vê o mapa de tendências**: cada célula mostra quanto mudou por década e se a mudança é significativa.
3. **Clica em uma região e aciona o "Find my seesaw"**: a ferramenta localiza as regiões com tendência oposta e variabilidade acoplada, e gera um "Case File" que responde às quatro perguntas do desafio: o que muda, onde, quanto, e se é significativo.

O deadline é domingo, 15/11, 23:59 (horário de São Paulo). Todo o formulário e o demo precisam estar em inglês; por isso a seção 7 já traz os textos em inglês.

## 2. Por que é inovador

A maioria das equipes vai entregar "mapa + gráfico de linha + regressão linear". O SEESAW se diferencia em três pontos.

| Diferencial | O que a maioria faz | O que o SEESAW faz |
| --- | --- | --- |
| Tendências opostas | Analisa cada região isoladamente | Busca ativamente o "par oposto" de qualquer região e mede o acoplamento entre os dois lados |
| Significância | p-valor de regressão linear por pixel | Mann-Kendall + inclinação de Theil-Sen, com correção de autocorrelação e controle de falsos positivos no mapa inteiro (FDR) |
| Comunicação | Números e mapas para especialistas | "Case File": um laudo curto, em linguagem simples, com nível de confiança explícito |

**Por que a significância é o ponto forte.** Testar milhares de células a 5% gera centenas de "tendências" que são puro acaso. Corrigir isso (FDR de Benjamini-Hochberg) é o que cientistas do clima fazem, e poucos projetos de hackathon fazem. O mapa terá um botão que liga e desliga a correção, para o usuário ver os falsos alarmes desaparecerem.

**Como cobre o desafio, item por item:**

- *Select variables*: seletor de variáveis de missões e modelos da NASA.
- *Visualize how they change over time*: mapa de tendência e série temporal da região clicada.
- *What / where / how much*: inclinação de Theil-Sen em unidades por década, por célula.
- *Significant*: Mann-Kendall com correções, mostrado como hachura no mapa e selo no Case File.
- *Opposite trends, same process*: o modo "Find my seesaw".

**Caso-vitrine sugerido:** chuva no Brasil, comparando o semiárido do Nordeste com o Sul. É uma hipótese a testar com os dados no sábado à noite; se o sinal não aparecer, a ferramenta indica outro par e usamos esse.

## 3. Como funciona

O processamento pesado roda antes, em Python, e o site só lê arquivos prontos. Isso deixa o demo rápido e sem dependência de servidor.

**Pipeline de análise (por variável):**

1. **Coleta**: baixar médias mensais em grade para a área de estudo, 1981 a 2025.
2. **Anomalias**: subtrair a climatologia mensal de cada célula, para remover a sazonalidade; agregar em médias anuais.
3. **Magnitude**: inclinação de Theil-Sen por célula (robusta a valores extremos), em unidade por década.
4. **Significância local**: teste de Mann-Kendall com pré-branqueamento (remove a autocorrelação que infla falsos positivos).
5. **Significância de campo**: correção FDR de Benjamini-Hochberg sobre todos os p-valores do mapa.
6. **Busca da gangorra**: para a célula A escolhida, pontuar cada célula B que tenha tendência significativa de sinal oposto.
7. **Case File**: gerar o laudo com os números e uma frase em linguagem simples.

**Pontuação da gangorra.** Para A e B com tendências de sinais opostos e ambas significativas:

```latex
S(A,B) = \sqrt{|\beta_A| \cdot |\beta_B|} \times \max\big(0, -r(\tilde{x}_A, \tilde{x}_B)\big)
```

Onde β é a inclinação padronizada de cada região e r é a correlação entre as séries *sem tendência*. O primeiro fator mede a força das tendências opostas; o segundo mede se as duas regiões oscilam em contrafase ano a ano, o que sugere um processo comum. A ferramenta mostra os três melhores pares e deixa claro que acoplamento estatístico é indício, não prova de causa.

**Conteúdo do Case File:**

| Pergunta do desafio | Campo no laudo | Exemplo de formato |
| --- | --- | --- |
| What is changing? | Variável e período | Precipitation, 1981-2025 |
| Where? | Região A e região B no mapa | Coordenadas e nome da região |
| How much? | Theil-Sen por década, com intervalo de 95% | mm/mês por década, com sinal |
| Is it significant? | Selo em três níveis | Significant / Suggestive / Not significant |
| Same process? | Força do acoplamento | Correlação das séries sem tendência |

## 4. Dados da NASA e de agências parceiras

O MVP usa duas fontes da NASA que não exigem login, o que elimina o maior risco de um hackathon de dados. Usar ao menos um dado da NASA é obrigatório para concorrer a prêmio global.

| Fonte | O que fornece | Papel no projeto | Acesso |
| --- | --- | --- | --- |
| [NASA POWER](https://power.larc.nasa.gov/) | Temperatura, chuva, umidade, vento e radiação solar em grade, desde 1981 (base MERRA-2 e CERES) | Fonte principal do MVP | API REST em JSON, sem login |
| [NASA GISTEMP v4](https://data.giss.nasa.gov/gistemp/) | Anomalia de temperatura global em grade, desde 1880 | Visão global e plano B | Arquivo NetCDF direto |
| [NASA Giovanni](https://giovanni.gsfc.nasa.gov/) | Mapas e séries de centenas de variáveis | Validação cruzada dos nossos mapas | Web, login Earthdata |
| GPM IMERG | Precipitação por satélite | Extensão futura | Login Earthdata |
| GRACE / GRACE-FO | Variação de massa de água | Extensão futura | Login Earthdata |
| MODIS NDVI | Vigor da vegetação | Extensão futura | Login Earthdata |

**Agência parceira.** A Agência Espacial Brasileira está na lista de parceiras de 2026 no guia de submissão. Dados do INPE (queimadas, desmatamento PRODES) entram como camada de contexto sobre o mapa de tendências, se sobrar tempo. Isso soma pontos em Relevância.

**Pontos a confirmar pela equipe:**

- Não consegui abrir a página oficial do desafio (o site bloqueia leitura automatizada). Confiram a aba *Resources* do desafio e citem no formulário ao menos um recurso listado lá.
- Os limites da API do POWER (tamanho da região por chamada, anos disponíveis no modo mensal) estão descritos de memória; validem na documentação antes de escrever o script de coleta.
- Criem uma conta Earthdata hoje, mesmo sem usar no MVP: ela libera o Giovanni para a validação.

## 5. Arquitetura e stack

Site estático alimentado por arquivos pré-calculados: nenhum backend para cair durante o julgamento.

| Camada | Tecnologia | Saída |
| --- | --- | --- |
| Coleta | Python, `requests` | Cubo de dados mensal por variável (NetCDF ou Parquet) |
| Análise | `xarray`, `numpy`, `pymannkendall`, `scipy`, `statsmodels` (FDR) | Um JSON por variável: inclinação, p-valor, p corrigido e série anual por célula |
| Gangorra | Calculada no navegador, a partir do JSON | Top 3 pares para a célula clicada |
| Interface | HTML + JavaScript, Leaflet (mapa), Plotly ou Chart.js (séries) | Mapa, painel de série e Case File |
| Hospedagem | Vercel ou GitHub Pages | Link público, sem login |
| Código | GitHub, repositório público, licença MIT | Link "Final Project" |

**Estrutura do repositório:**

```
seesaw/
  pipeline/
    01_fetch_power.py      # coleta da API POWER
    02_trends.py           # Theil-Sen, Mann-Kendall, FDR
    03_export_json.py      # gera web/data/<variavel>.json
  web/
    index.html
    app.js                 # mapa, clique, busca da gangorra
    casefile.js            # monta o laudo
    data/
  README.md                # em inglês, com método, dados e uso de IA
```

**Tamanho do problema.** Brasil e entorno em grade de 1 grau são cerca de 1.600 células por variável, com 45 valores anuais cada. O JSON fica na casa de centenas de kB e a busca da gangorra roda instantaneamente no navegador.

**Interface, uma tela só:** seletor de variável e período no topo; mapa de tendência no centro, com hachura onde é significativo e chave para a correção FDR; painel lateral com as duas séries (A e B) sobrepostas e o Case File, com botão para exportar como imagem.

## 6. Escopo do MVP e cronograma

Restam cerca de 33 horas até domingo 23:59. O MVP é uma região (Brasil e entorno), duas variáveis (temperatura e chuva) e o fluxo completo até o Case File.

**Entra no MVP:**

- Mapa de tendência com significância para temperatura e chuva, 1981-2025.
- Chave liga/desliga da correção FDR.
- Clique em uma célula, série temporal e "Find my seesaw" com os 3 melhores pares.
- Case File com as quatro respostas e o selo de significância.

**Fica como "próximos passos" no texto:** cobertura global, mais variáveis (GRACE, NDVI, IMERG), gangorras entre variáveis diferentes, camada do INPE, detecção de ponto de mudança.

| Quando | Entrega | Frente |
| --- | --- | --- |
| Sáb 15h-18h | Script de coleta rodando; esqueleto do site com mapa no ar na Vercel | Dados + Front |
| Sáb 18h-22h | Theil-Sen, Mann-Kendall e FDR validados em 5 células contra o Giovanni; JSON de temperatura | Dados |
| Sáb 22h-01h | Mapa lendo o JSON real; clique mostra a série | Front |
| Dom 08h-12h | Busca da gangorra e Case File; JSON de chuva | Front + Dados |
| Dom 12h-15h | Escolha do caso-vitrine; ajustes visuais; README em inglês | Todos |
| Dom 15h-18h | Demo (slides ou vídeo) e textos do formulário revisados | Demo |
| Dom 18h-20h | Primeira submissão completa; teste de todos os links em aba anônima | Dono da equipe |
| Dom 20h-23h | Folga para correções e resubmissão | Todos |

**Regra de ouro:** submeter às 20h, não às 23h50. O guia permite editar e resubmeter quantas vezes quiser até o prazo, e só a última versão salva é julgada.

**Divisão em três frentes:** Dados (pipeline Python), Front (mapa e Case File), Demo (slides ou vídeo, textos, formulário). Com menos de três pessoas, a frente Demo começa domingo ao meio-dia.

## 7. Textos para o formulário (em inglês)

Rascunhos para colar e ajustar. Revisem os trechos entre colchetes depois que o protótipo existir: o texto precisa descrever o que foi de fato construído.

### Project Name

SEESAW: Earth's Opposite-Trend Detective

### High-Level Project Summary

SEESAW is a web tool that finds "seesaws" in the Earth system: pairs of regions where the same variable is rising in one place and falling in another. Users pick a variable from NASA data, see a map of how much it has changed per decade since 1981, and learn where that change is statistically significant. With one click on any region, SEESAW searches for its opposite-trending counterpart and produces a plain-language Case File answering four questions: what is changing, where, how much, and is it significant. It addresses the challenge directly, including its hardest part: trends that run in opposite directions in different regions under a shared process. This matters because a single regional trend tells only half the story, and because untested trends mislead decisions on water, farming and energy.

### Detailed Project Description

**What it does.** SEESAW lets anyone select an Earth science variable (temperature and precipitation in this prototype), view a trend map, click a region to see its time series, and run "Find my seesaw" to locate regions with a significant opposite trend. Each result is summarized in a Case File that can be exported as an image.

**How it works.** A Python pipeline downloads monthly gridded data from the NASA POWER API, removes the seasonal cycle, and computes for every grid cell: (1) the Theil-Sen slope, a robust estimate of change per decade; (2) the Mann-Kendall trend test with pre-whitening to account for autocorrelation; and (3) a Benjamini-Hochberg false discovery rate correction across the whole map, so that significance holds for the field and not only cell by cell. Users can toggle this correction to see how many apparent trends are chance. The seesaw search scores candidate pairs by the strength of their opposite trends and by the anti-correlation of their detrended series, which indicates a possible shared driver. The tool states clearly that this is statistical evidence, not proof of cause.

**Benefits.** It turns a multi-step research workflow into three clicks, applies the significance standards used in climate science, and explains results in plain language for students, journalists and local planners.

**What we hope to achieve.** \[One sentence on the showcase finding once confirmed.\] Next steps are global coverage, more variables (GRACE water storage, MODIS vegetation, GPM IMERG rainfall), cross-variable seesaws, and partner agency layers.

**Tools.** Python (xarray, NumPy, SciPy, pymannkendall, statsmodels), JavaScript, Leaflet, \[Plotly or Chart.js\], GitHub, Vercel.

### NASA Data

- NASA POWER (Prediction Of Worldwide Energy Resources) API: monthly temperature at 2 m and precipitation, 1981-2025, derived from MERRA-2. Main data source for all trend maps.
- NASA GISTEMP v4: gridded surface temperature anomalies, used for \[global context / cross-check\].
- NASA Giovanni: used to validate our computed time series for sample grid cells.
- &#91;Add any resource used from the challenge's Resources tab.\]

### Space Agency Partner Data and Other References

- &#91;Brazilian Space Agency / INPE dataset, only if actually used.\]
- Open-source libraries: xarray, NumPy, SciPy, pymannkendall, statsmodels, Leaflet, \[Plotly or Chart.js\].
- Methods: Mann (1945) and Kendall (1975) trend test; Sen (1968) slope estimator; Benjamini and Hochberg (1995) false discovery rate; Wilks (2016) on field significance in atmospheric science.
- Base map: OpenStreetMap contributors.

### Use of Super Intelligence (SI)

Yes. We used a large language model (Claude, by Anthropic) to \[help structure the project plan, draft documentation, and assist with code\]. All SI-assisted code and text are acknowledged in the repository README and in file headers. No SI-generated images, video or audio are used. \[Adjust to match what the team actually did.\]

## 8. Roteiro do demo

Recomendo o deck de 7 slides: é mais rápido de produzir e cabe mais conteúdo que 30 segundos de vídeo. Passar de 7 slides ou de 30 segundos elimina o projeto do julgamento global.

**Deck (em inglês, pouco texto, telas reais do protótipo):**

| Slide | Conteúdo |
| --- | --- |
| 1. Title | SEESAW + tagline; Trindade Full-Stack; nomes dos membros; desafio "Be An Earth System Trend Detective!" |
| 2. The problem | Uma tendência regional conta meia história; a mesma variável sobe aqui e desce ali |
| 3. The idea | A gangorra: três cliques, da variável ao Case File |
| 4. The tool | Captura do mapa de tendência com a chave FDR ligada e desligada, lado a lado |
| 5. Find my seesaw | Captura do caso-vitrine: regiões A e B, séries sobrepostas, Case File |
| 6. Science and data | NASA POWER, GISTEMP, Giovanni; Theil-Sen, Mann-Kendall, FDR em uma linha cada |
| 7. Impact and next | Quem usa (estudantes, jornalistas, gestores); próximos passos; link do site |

Os slides 1 a 7 já cobrem as exigências do guia: nome da equipe, nomes dos membros, desafio escolhido, imagem do projeto, experiência do usuário e papel dos dados da NASA.

**Alternativa em vídeo (30 s no máximo, legendas em inglês obrigatórias se a fala for em português):**

| Tempo | Cena |
| --- | --- |
| 0:00-0:02 | "We are Trindade Full-Stack." |
| 0:02-0:05 | "The Earth doesn't change in one direction. It tilts." |
| 0:05-0:10 | "SEESAW: Earth's Opposite-Trend Detective." Tela inicial |
| 0:10-0:20 | Gravação de tela: escolher chuva, clicar numa região, "Find my seesaw", Case File aparece |
| 0:20-0:30 | "Built on NASA open data. Every trend tested. Next: the whole planet." |

**Restrições do guia:** nenhum menor de 18 anos em imagem, vídeo ou áudio; não usar logotipo ou identidade visual da NASA; imagens geradas por IA precisam de marca-d'água visível. Hospedar em Google Drive ou YouTube com link público, sem login.

## 9. Como pontuar nos cinco critérios

O guia lista cinco critérios: Impact, Creativity, Validity, Relevance e Presentation. A página do projeto é o que os juízes mais avaliam; o demo pesa em Presentation.

| Critério | Argumento do SEESAW | Onde mostrar |
| --- | --- | --- |
| Impact | Evita decisões baseadas em tendências que são acaso; útil para água, agricultura e energia | Summary e slide 7 |
| Creativity | A metáfora da gangorra e a busca ativa pelo par oposto | Nome, slides 3 e 5 |
| Validity | Métodos padrão da climatologia; validação contra o Giovanni; código aberto e reprodutível | Detailed Description, README, slide 6 |
| Relevance | Responde cada verbo do enunciado, inclusive o trecho sobre tendências opostas | Summary, primeira frase |
| Presentation | Uma tela, três cliques, laudo legível por leigos | Demo e site |

O maior risco de nota é Validity: se o caso-vitrine não for significativo após a correção, não o apresentem como descoberta. Um resultado honesto ("suggestive, not significant") vale mais que um exagero e reforça a proposta da ferramenta.

## 10. Checklist de submissão e riscos

**Antes de clicar em "Submit for Judging":**

- [ ] Todos os membros confirmados no mesmo evento local (São Paulo)
- [ ] Todos os campos obrigatórios preenchidos, em inglês
- [ ] Link do demo público, testado em aba anônima
- [ ] Link do projeto final (site e repositório) público, testado em aba anônima
- [ ] Demo com no máximo 7 slides ou 30 segundos
- [ ] Ao menos um dado da NASA descrito com detalhe no campo NASA Data
- [ ] Uso de IA declarado no formulário, no README e nos arquivos de código
- [ ] Nenhuma marca da NASA e nenhum menor de 18 anos no material
- [ ] Caixas "Terms and Conditions" e "Confirm All Work is Original" marcadas
- [ ] Banner de confirmação apareceu após a submissão
- [ ] Trava de edição ("Lock") ligada enquanto alguém edita a página

**Atenção à regra de IA.** O guia permite IA como ferramenta para acelerar o trabalho, mas diz que ela não deve ser usada para criar a ideia de como resolver o desafio. Este documento foi estruturado com ajuda de IA. Discutam o conceito em equipe, mudem o que não fizer sentido e só submetam o que vocês entendem e defendem como de vocês; declarem o uso com precisão.

| Risco | Sinal de alerta | Plano B |
| --- | --- | --- |
| API do POWER lenta ou limitada | Coleta não termina até sábado 18h | Usar só o NetCDF global do GISTEMP (temperatura) e reduzir a uma variável |
| Nenhuma gangorra significativa na região | Busca retorna vazio após FDR | Ampliar a área para a América do Sul ou mostrar pares "suggestive" com o selo correto |
| Front atrasado | Sem mapa com dado real sábado à noite | Cortar exportação de imagem e a segunda variável; manter mapa, clique e Case File |
| Site bloqueado para os juízes | Link não abre em outra rede | Pedir a classificação FortiGuard citada no guia e manter o repositório GitHub como link alternativo |
| Dois editando a página ao mesmo tempo | Texto some | Um único responsável pelo formulário, com a trava ligada |
