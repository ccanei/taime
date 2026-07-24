# Auditoria de contaminacao em relatorios PENDING_REVIEW (period < 2025)

Escaneados: 790 trends em 134 relatorios publicados historicos.
Somente leitura, nenhum dado alterado.

## Resumo
- Relatorios com >=1 achado: **70** de 134
- Relatorios com achado Tier-1 (anacronismo claro / termo-sintoma): **9**
- Relatorios com achado + fonte de alta contaminacao (crowdstrike/uipath/fortinet): **16**
- Total de achados: 264  (T1_anacronica=20, T1_sintoma=8, B_fonte_nomeada=81, COSMETIC_dup=0, T2_suspeito=14, T3_ano_futuro=141)
- Achados com ano 2026 (era da coleta): 0

## TIER 1 — achados prioritarios (anacronismo datado / termo nav-feed) (28)

| report_id | period | parte | trend | campo | ano/termo | fonte alta-contam | trecho |
|---|---|---|---|---|---|---|---|
| ee72cd27 | 2019-07-01 | 2 | 2 | then_now_next_en.now | sintoma:Magic Quadrant | uipath.com,forum.uipath.com,docs.uipath.com | As of mid-2019, the first Gartner Magic Quadrant and Everest PEAK Matrix rankings have ar |
| ee72cd27 | 2019-07-01 | 2 | 2 | then_now_next_en.then | sintoma:Magic Quadrant | uipath.com,forum.uipath.com,docs.uipath.com | ructure. No vendor had yet earned a place in a Gartner Magic Quadrant for the category, so buyers had little i |
| ee72cd27 | 2019-07-01 | 2 | 2 | taime_framework_en.executive_snapshot | sintoma:Magic Quadrant | uipath.com,forum.uipath.com,docs.uipath.com | enterprise infrastructure, with the first-ever Gartner Magic Quadrant and Everest PEAK Matrix rankings signali |
| ee72cd27 | 2019-07-01 | 2 | 2 | decision_triggers_en[0] | sintoma:Magic Quadrant | uipath.com,forum.uipath.com,docs.uipath.com | vendor secures Leader positioning across both Gartner Magic Quadrant and Everest PEAK Matrix, signaling durab |
| 28780d1d | 2018-06-01 | 2 | 6 | taime_framework_pt_br.type | sintoma:Forrester Wave | uipath.com,forum.uipath.com | rogramas corporativos governados, e a formalização via Forrester Wave e ecossistemas de certificação confirma |
| 28780d1d | 2018-06-01 | 2 | 6 | taime_framework_pt_br.executive_snapshot | sintoma:Forrester Wave | uipath.com,forum.uipath.com | nças, contabilidade, RH e atendimento. A publicação do Forrester Wave de Q2 2018 e a corrida por programas de |
| 28780d1d | 2018-06-01 | 2 | 6 | decision_triggers_pt_br[0] | sintoma:Forrester Wave | uipath.com,forum.uipath.com | Publicação do Forrester Wave de RPA Q2 2018 formalizando o quadrante |
| 5e6ae087 | 2020-12-16 | 1 | 3 | recommended_move_en | 2021 (datado) |  | Assign clear ownership and budget authority before Q1 2021 closes, because the cost of alignment during the p |
| 5e6ae087 | 2020-12-16 | 1 | 3 | taime_framework_en.move | 2021 (datado) |  | Convene a focused roadmap review before the end of Q1 2021 that maps current initiatives against the machine |
| 6e7be102 | 2020-09-16 | 3 | 3 | recommended_move_en | 2021 (datado) |  | t request and deletion tooling ahead of the POPIA June 2021 deadline, and assign cross-functional ownership th |
| 6e7be102 | 2020-09-16 | 3 | 3 | then_now_next_en.now | 2021 (datado) |  | 0, South Africa's POPIA entered full force with a June 2021 deadline, and Turkey and Ukraine issued new requir |
| 6e7be102 | 2020-09-16 | 3 | 3 | taime_framework_en.act | 2021 (datado) |  | ica's POPIA sets a hard compliance deadline of 30 June 2021, meaning the runway for building subject-request a |
| 6e7be102 | 2020-09-16 | 3 | 3 | taime_framework_en.move | 2021 (datado) |  | ect request and deletion tooling before the POPIA June 2021 deadline forces reactive scrambling. |
| 6e7be102 | 2020-09-16 | 3 | 3 | decision_triggers_en[1] | 2021 (datado) |  | ory deadlines such as POPIA full compliance by 30 June 2021 |
| f7322ee0 | 2020-11-16 | 2 | 1 | then_now_next_pt_br.next | 2021 (datado) |  | ulavam ferramentas sem valor. A trajetória sugeria que 2021 separaria líderes que redesenharam modelos operaci |
| 4bc6d3f5 | 2019-10-01 | 3 | 5 | recommended_move_en | 2020 (datado) |  | onal infrastructure and commit before the CCPA January 2020 deadline to a data inventory and a repeatable data |
| 4bc6d3f5 | 2019-10-01 | 3 | 5 | then_now_next_en.now | 2020 (datado) |  | Brazil's forthcoming law, combined with CCPA's January 2020 activation, show privacy law fragmenting into a mo |
| 4bc6d3f5 | 2019-10-01 | 3 | 5 | taime_framework_en.act | 2020 (datado) |  | mit in parallel now, because CCPA takes effect January 2020 and DPO obligations plus DSAR response deadlines a |
| 4bc6d3f5 | 2019-10-01 | 3 | 5 | taime_framework_en.executive_snapshot | 2020 (datado) |  | t access requests, DPO obligations, and CCPA's January 2020 deadline demand repeatable process rather than rea |
| a472c491 | 2019-11-01 | 3 | 5 | recommended_move_en | 2020 (datado) |  | sdiction data governance capability before the January 2020 CCPA deadline. Prioritize data discovery and a rep |
| a472c491 | 2019-11-01 | 3 | 5 | taime_score_rationale_en | 2020 (datado) |  | in Europe while a hard CCPA deadline lands in January 2020. Competitive pressure is real but diffuse, driven |
| a472c491 | 2019-11-01 | 3 | 5 | then_now_next_en.now | 2020 (datado) |  | ental model is already broken. CCPA arrives in January 2020, Nevada's opt-out law is live, Thailand's PDPA and |
| a472c491 | 2019-11-01 | 3 | 5 | taime_framework_pt_br.type | 2020 (datado) |  | bal fragmentado e permanente, com a CCPA em janeiro de 2020 marcando o momento em que o padrão deixa de ser re |
| a472c491 | 2019-11-01 | 3 | 5 | taime_framework_en.act | 2020 (datado) |  | Commit now, because CCPA takes effect in January 2020 and Poland's regulator has already imposed multipl |
| a472c491 | 2019-11-01 | 3 | 5 | taime_framework_en.move | 2020 (datado) |  | data subject access request process before the January 2020 CCPA deadline rather than after the first request |
| a472c491 | 2019-11-01 | 3 | 5 | decision_triggers_en[0] | 2020 (datado) |  | CCPA takes legal effect in California in January 2020, creating a hard compliance deadline |
| 9cc54aad | 2018-06-01 | 3 | 6 | then_now_next_en.next | 2019 (datado) |  | tection, Cayman enacting its own law effective January 2019, and California advancing state-level rules, the s |
| e61d9157 | 2019-07-01 | 3 | 3 | taime_score_rationale_pt_br | sintoma:Magic Quadrant |  | minante é pressão competitiva: enquanto a AWS lidera o Magic Quadrant de IaaS pelo nono ano, a Microsoft está |

## CATEGORIA B — fontes nomeadas como autoridade (revisao manual) (81)

| report_id | period | parte | trend | campo | ano/termo | fonte alta-contam | trecho |
|---|---|---|---|---|---|---|---|
| 02ccbeae | 2019-04-01 | 3 | 3 | then_now_next_pt_br.now | sintoma:Accenture |  | arial deixou de ser técnico e passou a ser organizacional. Casos como Accenture com a Generali em resseguro e  |
| 02ccbeae | 2019-04-01 | 3 | 3 | then_now_next_pt_br.now | sintoma:PwC |  | a concordar com padrões e um modelo operacional compartilhado, como a PwC destaca no caso aeroespacial. |
| 02ccbeae | 2019-04-01 | 3 | 3 | then_now_next_en.now | sintoma:PwC |  | hard part has already shifted from cryptography to coordination. The PwC aerospace signal names it directly: b |
| 02ccbeae | 2019-04-01 | 3 | 3 | taime_framework_pt_br.counter_thesis | sintoma:PwC |  | problema com menor complexidade, como o próprio sinal aeroespacial da PwC reconhece ao apontar a definição de  |
| 0cbe2d2e | 2020-11-01 | 1 | 4 | taime_score_rationale_pt_br | sintoma:KPMG | uipath.com | A pressão competitiva domina a leitura: UiPath, Automation Anywhere e KPMG expandem plataformas simultaneament |
| 0d0a6be6 | 2021-06-01 | 3 | 4 | then_now_next_en.next | sintoma:Gartner | crowdstrike.com | The trajectory suggested that Zero Trust would shift from a Gartner-defined concept toward a de facto architec |
| 1c834a6f | 2019-05-01 | 3 | 4 | then_now_next_pt_br.now | sintoma:BCG |  | o do JPMorgan, Salesforce com plataforma low-code sobre Hyperledger e BCG documentando casos híbridos com IoT  |
| 28780d1d | 2018-06-01 | 2 | 6 | taime_score_rationale_pt_br | sintoma:Forrester | uipath.com,forum.uipath.com | ath e Automation Anywhere estruturam ecossistemas de certificação e o Forrester consolida um quadrante formal, |
| 28780d1d | 2018-06-01 | 2 | 6 | taime_framework_pt_br.type | sintoma:Forrester | uipath.com,forum.uipath.com | isoladas para programas corporativos governados, e a formalização via Forrester Wave e ecossistemas de certifi |
| 28780d1d | 2018-06-01 | 2 | 6 | taime_framework_pt_br.executive_snapshot | sintoma:Forrester | uipath.com,forum.uipath.com | a cobrindo finanças, contabilidade, RH e atendimento. A publicação do Forrester Wave de Q2 2018 e a corrida po |
| 28780d1d | 2018-06-01 | 2 | 6 | decision_triggers_pt_br[0] | sintoma:Forrester | uipath.com,forum.uipath.com | Publicação do Forrester Wave de RPA Q2 2018 formalizando o quadrante competitivo de |
| 40810786 | 2020-10-16 | 3 | 1 | then_now_next_pt_br.next | sintoma:Accenture | fortinet.com | es em torno de soluções de indústria pré-empacotadas, como a parceria Accenture-SAP indica. Se o padrão se man |
| 40810786 | 2020-10-16 | 3 | 1 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture | fortinet.com | idade, ou adiar e acumular dívida técnica que só encarece. A parceria Accenture-SAP para soluções de indústria |
| 43034f38 | 2021-04-16 | 2 | 6 | then_now_next_pt_br.now | sintoma:Accenture |  | onfiáveis de Escopo 3 no momento em que fornecedores como Salesforce, Accenture e SAP estão tornando essa quan |
| 43034f38 | 2021-04-16 | 2 | 6 | then_now_next_en.now | sintoma:Accenture |  | ct feature embedded in the systems they already run. Salesforce, SAP, Accenture, and the hyperscalers are conv |
| 43034f38 | 2021-04-16 | 2 | 6 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture |  | tware e dado operacional. Quando Salesforce lança um hub de Escopo 3, Accenture e SAP embutem sustentabilidade |
| 43034f38 | 2021-04-16 | 2 | 6 | taime_framework_en.type | sintoma:Accenture |  | d into core enterprise software as Salesforce launches a Scope 3 hub, Accenture and SAP embed sustainability a |
| 43034f38 | 2021-04-16 | 2 | 6 | taime_framework_en.executive_snapshot | sintoma:Accenture |  | The April 2021 convergence of Salesforce Scope 3 tooling, the Accenture-SAP embedded sustainability partnershi |
| 4bbde50e | 2018-09-01 | 3 | 2 | then_now_next_pt_br.now | sintoma:McKinsey |  | percebeu é que a publicação simultânea de frameworks por Bain, KPMG, McKinsey, PwC e IBM reflete convergência  |
| 4bbde50e | 2018-09-01 | 3 | 2 | then_now_next_pt_br.now | sintoma:KPMG |  | da não percebeu é que a publicação simultânea de frameworks por Bain, KPMG, McKinsey, PwC e IBM reflete conver |
| 4bbde50e | 2018-09-01 | 3 | 2 | then_now_next_pt_br.now | sintoma:PwC |  | é que a publicação simultânea de frameworks por Bain, KPMG, McKinsey, PwC e IBM reflete convergência de market |
| 4bbde50e | 2018-09-01 | 3 | 2 | then_now_next_pt_br.now | sintoma:Bain |  | es ainda não percebeu é que a publicação simultânea de frameworks por Bain, KPMG, McKinsey, PwC e IBM reflete  |
| 4bbde50e | 2018-09-01 | 3 | 2 | then_now_next_en.now | sintoma:McKinsey |  | sulting frameworks signals crowded experimentation, not proven value. McKinsey explicitly frames blockchain in |
| 4c015d2d | 2018-05-01 | 2 | 3 | then_now_next_pt_br.now | sintoma:KPMG |  | Google Cloud lançando Cloud Composer em beta e firmando parceria com KPMG, e Azure expandindo marketplace e Se |
| 4d48e6bd | 2020-01-01 | 1 | 2 | then_now_next_en.now | sintoma:Bain |  | services maturing and platform vendors consolidating leadership, yet Bain notes silos still impede data flow a |
| 4f8ed247 | 2020-09-16 | 1 | 1 | then_now_next_pt_br.now | sintoma:Bain |  | crítico é o risco de concentração e aprisionamento, que a pesquisa da Bain aponta que a maioria dos CIOs subes |
| 4f8ed247 | 2020-09-16 | 1 | 1 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture |  | a com investimentos estruturais como o Cloud First de US$3 bilhões da Accenture. O insight não óbvio: enquanto |
| 5d717999 | 2019-05-01 | 1 | 1 | then_now_next_pt_br.now | sintoma:Bain |  | BM aponta que desafios de dados estão paralisando projetos de IA, e a Bain projeta que o talento de análise av |
| 5d717999 | 2019-05-01 | 1 | 1 | then_now_next_pt_br.next | sintoma:BCG |  | erem a camada de dados e institucionalizarem processos de IA, o que a BCG chama de "empresa biônica", começarã |
| 5e025554 | 2021-09-01 | 2 | 5 | then_now_next_en.now | sintoma:Accenture |  | th SAP paired with PwC, Oracle's all-in cloud subscription pivot, and Accenture's acquisition spree all point  |
| 5e025554 | 2021-09-01 | 2 | 5 | then_now_next_en.now | sintoma:PwC |  | s an operating model bundle, not a product. RISE with SAP paired with PwC, Oracle's all-in cloud subscription  |
| 5e025554 | 2021-09-01 | 2 | 5 | taime_framework_pt_br.executive_snapshot | sintoma:PwC |  | orquestrada por parcerias fornecedor-consultoria como RISE with SAP e PwC. O sinal não óbvio é que os grandes  |
| 5e025554 | 2021-09-01 | 2 | 5 | taime_framework_en.executive_snapshot | sintoma:Accenture |  | ting model where the consulting layer captures the value. The rush of Accenture acquisitions and the SAP-PwC p |
| 5e025554 | 2021-09-01 | 2 | 5 | taime_framework_en.executive_snapshot | sintoma:PwC |  | er captures the value. The rush of Accenture acquisitions and the SAP-PwC packaged partnerships reveals that t |
| 5e6ae087 | 2020-12-16 | 1 | 1 | then_now_next_pt_br.now | sintoma:Accenture |  | de execução organizacional. A onda de joint ventures como Generali e Accenture, e IndiGrid com IBM, revela que |
| 617d4eba | 2018-11-01 | 2 | 4 | taime_score_rationale_en | sintoma:Accenture |  | tting to cloud as a survival strategy, and the formation of dedicated Accenture-AWS delivery units signals the |
| 617d4eba | 2018-11-01 | 2 | 6 | taime_framework_en.type | sintoma:PwC |  | ggards who publicly concede they are behind, as the M&S admission and PwC metals analysis make explicit. |
| 6f3d75c3 | 2020-05-16 | 3 | 5 | then_now_next_pt_br.next | sintoma:PwC | crowdstrike.com | st como resposta arquitetural padrão à dissolução do perímetro, com a PwC já o descrevendo como mudança de par |
| 6fc821f1 | 2019-02-01 | 1 | 6 | then_now_next_pt_br.next | sintoma:KPMG |  | de soluções regtech baseadas em ML, conforme indicado pela análise da KPMG. A trajetória sugeria que a diferen |
| 73c551b0 | 2018-03-01 | 3 | 4 | then_now_next_pt_br.now | sintoma:Accenture |  | AB InBev, APL e Kuehne + Nagel e o relatório de logística entre DHL e Accenture mostram que a tração real vem  |
| 7a4057d4 | 2021-05-16 | 2 | 6 | then_now_next_en.now | sintoma:Accenture |  | g cloud-native everywhere, IBM anchoring hybrid, and integrators like Accenture and Thoughtworks acquiring clo |
| 7d3f0748 | 2019-01-01 | 2 | 1 | then_now_next_pt_br.now | sintoma:Accenture | marketplace.uipath.com,uipath.com,forum.uipath.com | ação, lojas de bots reutilizáveis, permissões por papel e o SynOps da Accenture, marcam a transição de ferrame |
| 7d3f0748 | 2019-01-01 | 2 | 1 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture | marketplace.uipath.com,uipath.com,forum.uipath.com | olaboração humano-máquina como modelo operacional, exatamente o que a Accenture formaliza ao lançar o SynOps c |
| 7d3f0748 | 2019-01-01 | 2 | 1 | taime_framework_en.type | sintoma:Accenture | marketplace.uipath.com,uipath.com,forum.uipath.com | ing from isolated pilots into governed enterprise infrastructure, and Accenture's SynOps launch cements the hu |
| 7d3f0748 | 2019-01-01 | 2 | 1 | taime_framework_en.executive_snapshot | sintoma:Accenture | marketplace.uipath.com,uipath.com,forum.uipath.com | ation, role-based permission frameworks, shared bot marketplaces, and Accenture's SynOps human-machine operati |
| 8aa7ac3f | 2018-10-01 | 2 | 3 | then_now_next_en.now | sintoma:Forrester | fortinet.com | he signals show hyperscalers expanding footprint aggressively while a Forrester analyst notes that hasty migra |
| 9742d0de | 2020-01-16 | 1 | 3 | then_now_next_pt_br.next | sintoma:Accenture | fortinet.com | a dorsal da IA em ciências da vida, com plataformas como a INTIENT da Accenture no Google Cloud e iniciativas  |
| 996bb5e2 | 2020-01-16 | 3 | 2 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture |  | is estão movendo-se agora, enquanto o ecossistema de parceiros como a Accenture corre para certificar acelerad |
| 996bb5e2 | 2020-01-16 | 3 | 2 | decision_triggers_pt_br[2] | sintoma:Accenture |  | ção de aceleradores de implantação por parceiros de integração como a Accenture |
| ac4f9338 | 2021-07-16 | 1 | 6 | then_now_next_en.now | sintoma:Omdia |  | signal that GPU dominance faces credible specialized challengers, yet Omdia's data confirms cloud and data cen |
| adba9e05 | 2020-01-01 | 3 | 6 | then_now_next_pt_br.next | sintoma:Accenture | fortinet.com | a, evidenciada pela aquisição do negócio de serviços da Symantec pela Accenture e pela compra da startup de se |
| c761cfce | 2020-08-16 | 3 | 6 | taime_framework_en.executive_snapshot | sintoma:Forrester | crowdstrike.com,fortinet.com | architectures still assumed existed. Zero Trust moved from a debated Forrester concept to an operational imper |
| cc1c1aa4 | 2021-07-01 | 3 | 4 | then_now_next_pt_br.now | sintoma:McKinsey |  | ntidade e infraestrutura para plataformas como APIs prontas, enquanto McKinsey documenta a ascensão contínua d |
| d153064e | 2020-02-16 | 3 | 2 | taime_score_rationale_pt_br | sintoma:Accenture |  | mpetitiva é visível através da consolidação (aquisição da Mudano pela Accenture) e da corrida de fornecedores  |
| d333547e | 2019-10-01 | 2 | 6 | then_now_next_pt_br.now | sintoma:McKinsey |  | competitivo está na capacidade de escalar a adoção, e as análises de McKinsey e Bain deslocam o foco para mode |
| d333547e | 2019-10-01 | 2 | 6 | then_now_next_pt_br.now | sintoma:Accenture |  | ia raramente é a causa do fracasso. Em outubro de 2019, a pesquisa da Accenture já quantifica que o diferencia |
| d333547e | 2019-10-01 | 2 | 6 | then_now_next_pt_br.now | sintoma:Bain |  | o está na capacidade de escalar a adoção, e as análises de McKinsey e Bain deslocam o foco para modelo operaci |
| d333547e | 2019-10-01 | 2 | 6 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture |  | a, mas escalar sua adoção dentro do modelo operacional. A pesquisa da Accenture com mais de 8.300 organizações |
| d333547e | 2019-10-01 | 2 | 6 | taime_framework_en.executive_snapshot | sintoma:Accenture |  | The GE and Ford transformation failures and Accenture's survey of more than 8,300 organizations converge on an |
| d78af03c | 2021-02-16 | 2 | 3 | then_now_next_en.now | sintoma:Deloitte | uipath.com | iple years, and leaning heavily on system integrator partners such as Deloitte, Syniti, and Accenture. The tec |
| d78af03c | 2021-02-16 | 2 | 3 | then_now_next_en.now | sintoma:Accenture | uipath.com | g heavily on system integrator partners such as Deloitte, Syniti, and Accenture. The technology works. The cha |
| d78af03c | 2021-02-16 | 2 | 4 | then_now_next_pt_br.now | sintoma:Accenture |  | em um a dois anos o que antes levava uma década, e consultorias como Accenture estão adquirindo capacidades de |
| dc1743e5 | 2018-10-01 | 3 | 3 | taime_score_rationale_pt_br | sintoma:Accenture |  | itiva é visível entre consultorias e gigantes de infraestrutura (IBM, Accenture, Microsoft) que disputam o pad |
| dc1743e5 | 2018-10-01 | 3 | 3 | then_now_next_pt_br.now | sintoma:Accenture |  | ia em geral. A IBM Food Trust está em lançamento comercial, a solução Accenture-Digital Ventures já opera na T |
| dc1743e5 | 2018-10-01 | 3 | 3 | then_now_next_pt_br.next | sintoma:Accenture |  | entre plataformas como o campo de batalha decisivo, com o trabalho da Accenture sincronizando Digital Asset, C |
| dc1743e5 | 2018-10-01 | 3 | 3 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture |  | lândia. O sinal decisivo não é a tecnologia em si, mas o movimento da Accenture para sincronizar plataformas r |
| dc1743e5 | 2018-10-01 | 3 | 4 | taime_score_rationale_pt_br | sintoma:KPMG |  | IBM estão movendo capital e parcerias em ritmo acelerado, enquanto o KPMG FinTech100 confirma que challengers  |
| dc1743e5 | 2018-10-01 | 3 | 4 | then_now_next_pt_br.now | sintoma:KPMG |  | s investidores mais agressivos em IA para fraude, câmbio e crédito. O KPMG FinTech100 e a escala das maiores p |
| dc1743e5 | 2018-10-01 | 3 | 4 | then_now_next_en.now | sintoma:KPMG |  | imate is that fintech has become systemic rather than peripheral. The KPMG FinTech100 and the scale of the lar |
| e8b16796 | 2018-08-01 | 2 | 4 | taime_framework_pt_br.type | sintoma:Forrester |  | ca de entrega, sinalizado pela aquisição da Mendix pela Siemens que a Forrester descreveu como entrada da cate |
| ee72cd27 | 2019-07-01 | 2 | 2 | then_now_next_en.now | sintoma:Gartner | uipath.com,forum.uipath.com,docs.uipath.com | As of mid-2019, the first Gartner Magic Quadrant and Everest PEAK Matrix rankings have arrived, |
| ee72cd27 | 2019-07-01 | 2 | 2 | then_now_next_en.then | sintoma:Gartner | uipath.com,forum.uipath.com,docs.uipath.com | than strategic infrastructure. No vendor had yet earned a place in a Gartner Magic Quadrant for the category,  |
| ee72cd27 | 2019-07-01 | 2 | 2 | taime_framework_en.executive_snapshot | sintoma:Gartner | uipath.com,forum.uipath.com,docs.uipath.com | n to analyst-validated enterprise infrastructure, with the first-ever Gartner Magic Quadrant and Everest PEAK  |
| ee72cd27 | 2019-07-01 | 2 | 2 | decision_triggers_en[0] | sintoma:Gartner | uipath.com,forum.uipath.com,docs.uipath.com | A vendor secures Leader positioning across both Gartner Magic Quadrant and Everest PEAK Matrix, signaling dura |
| ee72cd27 | 2019-07-01 | 2 | 4 | taime_score_rationale_pt_br | sintoma:Accenture |  | tória. A pressão competitiva se concentra em jogadores de escala como Accenture, IBM e Google que constroem pr |
| ee72cd27 | 2019-07-01 | 2 | 4 | then_now_next_pt_br.next | sintoma:Accenture |  | tavam para uma bifurcação: consultorias e fornecedores de escala como Accenture, IBM e Google continuariam acu |
| ee72cd27 | 2019-07-01 | 2 | 4 | taime_framework_pt_br.executive_snapshot | sintoma:Accenture |  | promete a criptografia que protege dados corporativos agora. Enquanto Accenture patenteia módulos híbridos e b |
| ee72cd27 | 2019-07-01 | 2 | 5 | then_now_next_pt_br.now | sintoma:Accenture |  | esarial permanece preso à fase de pilotos, com consultorias como EY e Accenture monetizando serviços de avalia |
| f0c0ba06 | 2021-01-01 | 2 | 6 | then_now_next_pt_br.now | sintoma:McKinsey |  | rar, e sim sobre governar. As aquisições de empresas cloud-native por McKinsey e Accenture, e a compra da Volt |
| f0c0ba06 | 2021-01-01 | 2 | 6 | then_now_next_pt_br.now | sintoma:Accenture |  | sobre governar. As aquisições de empresas cloud-native por McKinsey e Accenture, e a compra da Volterra pela F |
| f7322ee0 | 2020-11-16 | 2 | 2 | then_now_next_pt_br.next | sintoma:Accenture |  | adas ganhariam tração em setores regulados, e que integradores como a Accenture continuariam consolidando capa |

## COSMETICO — duplicacao de paragrafo (0)

| report_id | period | parte | trend | campo | ano/termo | fonte alta-contam | trecho |
|---|---|---|---|---|---|---|---|

## TIER 2 — suspeitos (ano era-coleta sem data) (14)

| report_id | period | parte | trend | campo | ano/termo | fonte alta-contam | trecho |
|---|---|---|---|---|---|---|---|
| 0415bfca | 2020-02-16 | 2 | 2 | taime_score_rationale_pt_br | 2027 |  | de cargas legadas críticas (SAP S/4HANA com prazo até 2027) cria janelas de decisão com consequências plurian |
| 0415bfca | 2020-02-16 | 2 | 2 | then_now_next_pt_br.next | 2027 |  | as cargas legadas mais resistentes: SAP com prazo até 2027 e mainframes. Os dados indicavam que a diferenciaç |
| 0415bfca | 2020-02-16 | 2 | 2 | taime_framework_pt_br.act | 2027 |  | os de migração legada (como SAP S/4HANA estendido para 2027) e novas regiões de datacenter abrindo em mercados |
| 0415bfca | 2020-02-16 | 2 | 2 | decision_triggers_pt_br[1] | 2027 |  | ção do prazo de migração do SAP S/4HANA estendido para 2027 sem caminho de migração definido |
| 0a0ae708 | 2019-11-01 | 1 | 1 | title_pt_br | 2025 |  | ação sem execução ameaça sobrevivência corporativa até 2025 |
| 0a0ae708 | 2019-11-01 | 1 | 1 | recommended_move_pt_br | 2025 |  | ela apontada pela evidência favorece quem age antes de 2025. |
| 0a0ae708 | 2019-11-01 | 1 | 1 | taime_framework_pt_br.executive_snapshot | 2025 |  | coloca a própria continuidade do negócio em risco até 2025, enquanto os dados de pesquisa mostram que poucas |
| 0a0ae708 | 2019-11-01 | 1 | 1 | taime_framework_en.executive_snapshot | 2025 |  | scale AI beyond experimentation threatens survival by 2025, yet survey benchmarks show most organizations hav |
| 381b8f17 | 2021-03-01 | 2 | 2 | then_now_next_pt_br.now | 2028 |  | minhões autônomos, e a projeção de US$ 800 bilhões até 2028 sinaliza que o capital já enxerga uma categoria de |
| 381b8f17 | 2021-03-01 | 2 | 2 | taime_framework_pt_br.executive_snapshot | 2028 |  | el, com projeção de mercado de até US$ 800 bilhões até 2028. O sinal não óbvio é que a batalha competitiva já |
| 77c8a41c | 2021-08-16 | 1 | 2 | then_now_next_en.now | 2025 |  | les into architecture: national AI strategies for 2021-2025, standards bodies drafting risk and governance fra |
| dbddf76f | 2021-08-16 | 3 | 3 | taime_framework_pt_br.act | 2025 |  | rojeção de dezenas de milhões de postos deslocados até 2025 significa que organizações que adiarem o planejame |
| dbddf76f | 2021-08-16 | 3 | 3 | taime_framework_pt_br.executive_snapshot | 2025 |  | ela redivisão de trabalho entre humanos e máquinas até 2025. O sinal não óbvio é que consultorias globais e or |
| ee72cd27 | 2019-07-01 | 2 | 3 | taime_framework_pt_br.executive_snapshot | 2025 |  | ificar um terço de sua força de trabalho americana até 2025 estabelece um novo padrão: quem trata reskilling c |

## TIER 3 (anos futuros < 2025, provavel projecao legitima) omitido do detalhe. Total: 141
