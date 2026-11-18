# Dev Studio

Criar o projeto 
DEV STUDIO — IMPLEMENTAÇÃO COMPLETA DA PLATAFORMA



OBJETIVO PRINCIPAL



Construir um ambiente privado de desenvolvimento de aplicativos com inteligência artificial, utilizando Google AI Studio (Gemini), GitHub e Supabase.



O sistema deverá funcionar como uma IDE com agente de desenvolvimento, capaz de criar aplicativos, conectar repositórios, editar código, executar auditorias, manter histórico permanente e continuar projetos mesmo após troca de API ou encerramento de uma conversa.



IMPORTANTE:

Não criar somente uma interface visual. Implementar banco de dados, autenticação, conexões reais, funções backend e operações funcionais.



Não utilizar dados fictícios para simular funcionalidades concluídas.



1. ESTRUTURA PRINCIPAL



Criar as seguintes áreas:



- Início / Dashboard

- Novo chat

- Histórico de chats

- Projetos

- Repositórios GitHub

- Central de auditoria

- Memória dos projetos

- Tarefas e execução

- Checkpoints

- Configurações

- Gerenciador de APIs



Utilizar interface profissional de IDE, tema escuro, navegação lateral, painel central de trabalho e layout responsivo.



2. CONFIGURAÇÕES — CENTRAL DE CONEXÕES



Criar uma página completa de configurações com três integrações independentes.



A. SUPABASE



Adicionar:



- URL do projeto.

- Project Reference.

- Publishable Key.

- Credencial administrativa para instalação, exclusivamente no backend.

- Testar conexão.

- Instalar estrutura automaticamente.

- Verificar banco.

- Atualizar migrations.

- Status da conexão.



LINKS DE ACESSO:



Dashboard:

https://supabase.com/dashboard



Criar projeto:

https://supabase.com/dashboard/new



Documentação de API:

https://supabase.com/docs/guides/api



Documentação de chaves:

https://supabase.com/docs/guides/api/api-keys



SQL Editor:

https://supabase.com/dashboard/project/_/sql



A conexão deverá permitir instalação automática de toda a estrutura do DEV STUDIO.



Caso não seja possível provisionar o banco diretamente, disponibilizar SQL de instalação assistida.



B. GOOGLE AI STUDIO — GEMINI API



Criar um gerenciador de múltiplas API Keys.



Campos:



- Nome da chave.

- API Key.

- Modelo selecionado.

- Status.

- Testar conexão.

- Definir como principal.

- Adicionar chave reserva.

- Remover chave.

- Ativar e desativar chave.

- Consultar erros de cota.



LINKS DE ACESSO:



Google AI Studio:

https://aistudio.google.com/



Criar API Key:

https://aistudio.google.com/apikey



Documentação Gemini API:

https://ai.google.dev/gemini-api/docs



Preços e limites:

https://ai.google.dev/gemini-api/docs/rate-limits



O usuário deverá conseguir cadastrar várias chaves de diferentes projetos Google.



Implementar seleção manual e alternância controlada entre chaves.



Quando uma chave atingir limite:



1. Identificar o erro real de cota.

2. Interromper novas operações daquela chave.

3. Salvar checkpoint.

4. Verificar as demais chaves cadastradas.

5. Testar a chave reserva.

6. Se estiver disponível, selecioná-la.

7. Recuperar o contexto do projeto.

8. Continuar a execução da tarefa pendente.



Não criar ciclos infinitos de tentativas.



Não afirmar que uma nova chave oferece cota adicional se pertencer ao mesmo projeto ou estiver sujeita ao mesmo limite.



Nunca expor API Keys no frontend, histórico ou logs.



C. GITHUB



Criar uma integração completa para conectar repositórios.



Campos:



- Personal Access Token.

- Nome da conexão.

- Status.

- Testar conexão.

- Atualizar token.

- Desconectar.

- Selecionar repositórios autorizados.



LINKS DE ACESSO:



GitHub:

https://github.com/



Criar Personal Access Token:

https://github.com/settings/personal-access-tokens



Tokens clássicos:

https://github.com/settings/tokens



Aplicativos OAuth:

https://github.com/settings/developers



Documentação REST API:

https://docs.github.com/en/rest



O sistema deverá:



- Listar repositórios.

- Criar repositórios.

- Importar projetos existentes.

- Ler estrutura de diretórios.

- Ler arquivos.

- Criar arquivos.

- Modificar arquivos.

- Remover arquivos mediante autorização.

- Consultar commits.

- Criar commits.

- Consultar branches.

- Criar branches.

- Consultar diferenças entre versões.

- Sincronizar alterações.



Solicitar apenas as permissões necessárias.



3. INSTALADOR AUTOMÁTICO SUPABASE



Depois da conexão, oferecer botão:



INSTALAR DEV STUDIO



O instalador deverá criar automaticamente:



1. profiles

2. api_connections

3. projects

4. repositories

5. chats

6. chat_messages

7. project_memory

8. development_tasks

9. development_logs

10. audit_logs

11. checkpoints

12. repository_snapshots

13. migration_history

14. agent_sessions

15. file_changes

16. test_results



Criar também:



- Relacionamentos.

- Chaves estrangeiras.

- Índices.

- Políticas RLS.

- Permissões.

- Storage.

- Funções backend.

- Migrations versionadas.



Preservar dados existentes.



Não utilizar credenciais administrativas no navegador.



4. SISTEMA DE NOVO CHAT



Ao clicar em NOVO CHAT:



1. Solicitar o projeto.

2. Permitir criar ou selecionar um repositório.

3. Solicitar modelo de IA.

4. Consultar histórico do projeto.

5. Consultar memória permanente.

6. Consultar auditorias.

7. Consultar tarefas pendentes.

8. Ler o estado atual do GitHub.

9. Montar contexto.

10. Iniciar o agente.



Cada chat deverá possuir histórico próprio, mas compartilhar a memória permanente do projeto selecionado.



Permitir alternar entre chats sem perder informações.



5. AGENTE DE DESENVOLVIMENTO



Implementar agente capaz de:



- Entender solicitações.

- Planejar implementação.

- Analisar o código existente.

- Ler arquivos do repositório.

- Identificar dependências.

- Criar e modificar código.

- Executar testes em ambiente isolado.

- Analisar erros.

- Corrigir problemas.

- Criar commits.

- Atualizar histórico.

- Criar checkpoints.



Não permitir que o agente declare uma funcionalidade pronta sem verificar o resultado real.



6. HISTÓRICO INTELIGENTE



Manter permanentemente:



- Conversas completas.

- Decisões técnicas.

- Arquivos analisados.

- Arquivos criados.

- Alterações realizadas.

- Tarefas concluídas.

- Tarefas pendentes.

- Erros.

- Correções.

- Testes.

- Commits.

- Auditorias.



A memória deve ser organizada por projeto.



Criar resumo de contexto estruturado e atualizado após cada operação importante.



7. AUDITORIA INTELIGENTE



Criar módulo independente de auditoria.



Toda operação deverá registrar:



- Data e hora.

- Projeto.

- Chat de origem.

- Agente responsável.

- Arquivo afetado.

- Alteração realizada.

- Resultado.

- Evidências.

- Commit relacionado.

- Testes executados.



Estados:



- Pendente.

- Em execução.

- Concluído.

- Falhou.

- Reprovado.

- Necessita correção.



A auditoria deverá conferir o código real, diferenças do GitHub, resultados de testes e build.



Nunca aprovar algo apenas com base na resposta textual da IA.



8. CONTINUIDADE AUTOMÁTICA



Implementar o recurso mais importante da plataforma.



Quando uma API atingir limite, houver desconexão ou o usuário encerrar uma sessão:



- Salvar o estado da execução.

- Criar checkpoint.

- Registrar a última operação concluída.

- Identificar alterações incompletas.

- Registrar arquivos modificados.

- Registrar tarefas pendentes.

- Preservar o contexto técnico.

- Registrar erros.



Quando uma nova API for conectada, o agente deverá:



1. Recuperar o checkpoint.

2. Consultar histórico.

3. Consultar auditorias.

4. Consultar memória.

5. Ler novamente o repositório.

6. Comparar o estado atual com o checkpoint.

7. Identificar divergências.

8. Retomar somente após validar o estado real.



Não reiniciar o projeto do zero.



Não repetir operações já concluídas.



Não sobrescrever alterações externas sem análise.



9. DASHBOARD DE PROJETOS



Criar painel mostrando:



- Projetos ativos.

- Repositórios vinculados.

- Último desenvolvimento.

- Última auditoria.

- Tarefas pendentes.

- API atualmente selecionada.

- Status das conexões.

- Checkpoints disponíveis.



Cada projeto deve abrir seu próprio workspace.



10. SEGURANÇA



Implementar:



- Autenticação Supabase.

- RLS em todas as tabelas privadas.

- Separação de dados por usuário.

- Criptografia das credenciais externas.

- Backend seguro.

- Proteção contra exposição de tokens.

- Logs sem segredos.

- Confirmação para operações destrutivas.

- Controle de concorrência entre sessões.



11. TESTES E VALIDAÇÃO



Criar uma central de testes que valide:



- Conexão Supabase.

- Instalação do banco.

- Autenticação.

- Conexão Gemini.

- Conexão GitHub.

- Listagem de repositórios.

- Criação de arquivos.

- Alteração de arquivos.

- Criação de commits.

- Persistência de chats.

- Recuperação de memória.

- Criação de checkpoints.

- Recuperação após troca de API.

- Auditoria das alterações.

- Isolamento entre usuários.



Mostrar resultados reais.



12. ORDEM DE IMPLEMENTAÇÃO



Executar nesta sequência:



FASE 1 — Estrutura visual e navegação.



FASE 2 — Supabase, autenticação e instalação automática do banco.



FASE 3 — GitHub, conexão e gerenciamento de repositórios.



FASE 4 — Google AI Studio e múltiplas API Keys.



FASE 5 — Chat funcional com Gemini.



FASE 6 — Memória permanente e histórico.



FASE 7 — Auditoria inteligente.



FASE 8 — Checkpoints e retomada automática.



FASE 9 — Testes integrados e validação.



Não considerar uma fase concluída enquanto suas operações reais não estiverem funcionando.



Não criar telas vazias para simular módulos implementados.



Não remover funcionalidades existentes sem necessidade.



Ao finalizar cada fase, apresentar relatório com:



- O que foi criado.

- O que foi conectado.

- O que foi testado.

- O que foi aprovado.

- O que ainda está pendente.



OBJETIVO FINAL:



Entregar um DEV STUDIO privado, funcional e persistente, capaz de criar aplicativos usando Gemini, trabalhar diretamente nos repositórios GitHub, armazenar todo o histórico no Supabase, realizar auditorias reais e continuar qualquer projeto mesmo após troca de API, chat ou sessão.

DEV STUDIO — REFINAMENTO MOBILE-FIRST E NAVEGAÇÃO PROFISSIONAL



Implemente um refinamento completo da interface do DEV STUDIO, priorizando dispositivos móveis, especialmente Android e iPhone.



IMPORTANTE: preservar todas as funcionalidades, integrações, banco de dados, APIs, chats, projetos e módulos já implementados. Esta solicitação é exclusivamente para aprimorar layout, navegação, responsividade e experiência de uso.



1. RESPONSIVIDADE REAL



Adotar abordagem Mobile First.



A interface deverá funcionar perfeitamente em:



- Smartphones pequenos.

- Smartphones grandes.

- Tablets.

- Notebooks.

- Monitores desktop.



Eliminar completamente:



- Rolagem horizontal involuntária.

- Elementos ultrapassando a largura da tela.

- Painéis cortados.

- Botões fora da área visível.

- Textos sobrepostos.

- Menus que não cabem na tela.

- Tabelas que forçam a largura da página.

- Componentes que exigem arrastar lateralmente para encontrar ações essenciais.



Aplicar largura fluida, limites de largura, flexibilidade dos componentes e adaptação de espaçamento.



Utilizar "min-width: 0", "max-width: 100%", "box-sizing: border-box" e tratamento adequado de conteúdo longo.



Não resolver problemas de overflow simplesmente escondendo conteúdo importante.



2. NAVEGAÇÃO MOBILE PROFISSIONAL



Criar navegação mobile própria, não apenas reduzir a sidebar desktop.



Utilizar:



- Barra superior compacta.

- Menu lateral em drawer.

- Navegação inferior fixa.

- Ícones consistentes.

- Indicadores de seção ativa.

- Transições suaves.

- Áreas de toque confortáveis.



A navegação inferior deverá conter:



1. Início.

2. Projetos.

3. Novo chat.

4. Histórico.

5. Configurações.



O botão Novo chat deve possuir destaque visual moderado.



O drawer deverá apresentar:



- Lista de projetos.

- Repositórios.

- Auditorias.

- Memória.

- Gerenciador de APIs.

- Configurações.

- Perfil e sair.



O drawer deverá fechar automaticamente após a seleção de uma seção.



3. CHAT MOBILE



O chat é uma das áreas mais importantes do DEV STUDIO.



Desenvolver uma experiência semelhante à de aplicativos profissionais de IA.



No celular:



- Chat ocupa toda a área disponível.

- Cabeçalho compacto.

- Identificação do projeto ativo.

- Identificação do modelo de IA.

- Histórico acessível.

- Campo de mensagem fixado na parte inferior.

- Botão de envio sempre acessível.

- Textarea expansível.

- Suporte a mensagens longas.

- Blocos de código com rolagem interna.

- Botão de copiar código.

- Exibição organizada de arquivos modificados.



Não permitir que o teclado virtual esconda o campo de mensagem ou o botão enviar.



Respeitar as áreas seguras do dispositivo (safe areas).



4. NAVEGAÇÃO DESKTOP



No desktop, preservar uma experiência de IDE profissional:



- Sidebar recolhível.

- Área principal ampla.

- Painéis de contexto.

- Histórico acessível.

- Painel de arquivos.

- Visualização de auditorias.

- Área de chat central.



Evitar excesso de elementos visuais.



5. PROJETOS E REPOSITÓRIOS



No mobile, exibir projetos em cartões compactos.



Cada cartão deve apresentar:



- Nome.

- Repositório conectado.

- Última atividade.

- Status de auditoria.

- Tarefas pendentes.

- Botão abrir projeto.



Não utilizar tabelas largas no smartphone.



No desktop, permitir visualização em tabela ou grade.



6. CONFIGURAÇÕES MOBILE



Organizar as integrações em cartões independentes:



- Supabase.

- Google AI Studio.

- GitHub.



Cada integração deverá mostrar:



- Ícone.

- Nome.

- Estado da conexão.

- Último teste.

- Ação configurar.

- Ação testar.



Os formulários de API Key deverão ocupar a largura disponível, sem campos cortados.



Os links externos para obtenção de tokens deverão ser apresentados em botões ou links acessíveis e organizados.



7. AUDITORIA E HISTÓRICO



No mobile, utilizar cartões verticais e linha do tempo.



Mostrar:



- Data e hora.

- Operação.

- Arquivo afetado.

- Resultado.

- Evidências.

- Status.



Permitir expandir detalhes sem abrir uma tela excessivamente larga.



8. PADRÃO VISUAL



Adotar identidade visual de uma IDE profissional.



Diretrizes:



- Tema escuro refinado.

- Fundo grafite.

- Superfícies com contraste discreto.

- Bordas sutis.

- Tipografia legível.

- Ícones Lucide consistentes.

- Espaçamento equilibrado.

- Hierarquia visual clara.

- Animações discretas.

- Estados de carregamento profissionais.

- Feedback visual para erros e sucessos.



Evitar:



- Gradientes excessivos.

- Botões gigantes.

- Cartões desnecessários.

- Bordas exageradas.

- Textos pequenos.

- Excesso de cores.

- Elementos decorativos que atrapalhem a produtividade.



9. PADRÃO DE INTERAÇÃO



Todas as ações devem possuir:



- Feedback imediato.

- Estado de carregamento.

- Tratamento de erros.

- Confirmação para ações destrutivas.

- Área de toque adequada.

- Acessibilidade por teclado.

- Foco visível.



Não permitir botões decorativos sem funcionalidade.



10. TESTES OBRIGATÓRIOS



Testar a interface em larguras de:



- 320px.

- 360px.

- 375px.

- 390px.

- 430px.

- 768px.

- 1024px.

- 1366px.

- 1920px.



Verificar em todas:



- Ausência de overflow horizontal na página.

- Navegação funcionando.

- Menus funcionando.

- Chat utilizável.

- Teclado virtual.

- Formulários.

- Cartões.

- Auditorias.

- Histórico.

- Configurações.

- Modais e diálogos.



Corrigir todos os problemas encontrados.



11. REGRA FINAL



O resultado deverá parecer um produto profissional de desenvolvimento de software, e não uma página web simplesmente adaptada para celular.



Priorizar navegação intuitiva, velocidade, organização, legibilidade e produtividade.



Não alterar a lógica de negócio, não remover integrações e não substituir dados reais por demonstrações.



Implementar e validar todas as adaptações diretamente no projeto existente.
E já aplicar o mobile

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/96811bd5-b7df-43a4-aa00-1139a49401fa).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
