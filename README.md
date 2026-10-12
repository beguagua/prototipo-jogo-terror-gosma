# A Great Day with Grey Eyes — Protótipo 0.4 (Babylon.js)

## O que esta versão já tem
- Babylon.js como motor 3D.
- Cidade procedural modular carregada por setores ao redor do jogador.
- Limpeza de setores distantes para controlar uso de memória.
- Controles de teclado e controles touch básicos.
- Ajustes de qualidade e distância de visão.
- HUD, marcador de pista, menu e contador de FPS.
- Service Worker para cache do núcleo do projeto quando servido por HTTPS ou localhost.
- Catálogo de fontes CC0 / fontes de áudio com licença a verificar em `assets/manifest.json`.

## O que ainda NÃO está incluído
- Esta versão não tem 5 GB de modelos reais. O tamanho de 5 GB é uma meta de conteúdo futuro.
- Os edifícios, carros, postes e pista atuais são formas procedurais de protótipo.
- Ainda não há personagem humano realista, animações finais, áudio final, arma funcional, combate completo, IA inimiga, salvamento, campanha longa ou interiores detalhados.
- O jogo depende do CDN oficial do Babylon.js na primeira carga. Para offline totalmente independente, as bibliotecas devem ser baixadas e incluídas localmente após conferir as licenças/termos.

## Como executar
1. Extraia o ZIP.
2. Sirva a pasta por HTTPS ou por um servidor local. O método `file://` pode bloquear módulos, cache e algumas APIs.
3. Abra `index.html` num navegador moderno.
4. Para um teste local, se houver Python instalado: `python3 -m http.server 8000` e abra `http://localhost:8000`.
5. No iPad, use uma hospedagem HTTPS; abrir um arquivo ZIP diretamente não instala um site offline.

## Como os assets são integrados
1. Baixe manualmente um pacote de uma fonte oficial.
2. Extraia arquivos GLB/glTF e texturas para a pasta `assets/`.
3. Registre cada arquivo em `assets/manifest.json`.
4. Importe modelos glTF/GLB usando o loader oficial do Babylon.js (`BABYLON.SceneLoader.ImportMeshAsync`).
5. Otimize modelos (LOD), texturas (KTX2/Basis quando aplicável), áudio comprimido e agrupe o mapa em chunks.
6. Teste desempenho e uso de armazenamento em iPad e PC.

## Offline e os 5 GB
- O Service Worker faz cache do shell do site, não baixa automaticamente bibliotecas de 5 GB.
- O navegador pode negar ou remover armazenamento, e iOS pode impor limites. Solicite armazenamento persistente quando suportado e sempre mostre tamanho/progresso/cancelamento antes de baixar pacotes grandes.
- Para uma experiência de 5 GB confiável, a melhor opção final é um instalador de PC ou um servidor/CDN próprio com pacotes separados e verificação de integridade. Um protótipo web pode usar streaming, mas não deve depender de 5 GB de cache permanente no iPad.

## Fontes iniciais
- Kenney City Kit Suburban — CC0: https://kenney.nl/assets/city-kit-suburban
- Kenney City Kit Roads — CC0: https://kenney.nl/assets/city-kit-roads
- Kenney City Kit Industrial — CC0: https://kenney.nl/assets/city-kit-industrial
- Poly Haven Models / Textures / HDRIs — CC0: https://polyhaven.com/
- Áudio: use fontes com licença clara; verifique cada arquivo, por exemplo Freesound.

O protótipo é uma base técnica, não um jogo comercial final.


## Catálogo ampliado de recursos (0.4.1)
Abra `ASSET_CATALOG.html` para a lista de fontes oficiais de modelos urbanos, interiores, vegetação, personagens, materiais e áudio. `assets/manifest.json` contém a lista estruturada para futura ferramenta de importação.

**Transparência:** os pacotes externos ainda não estão embutidos no ZIP. As páginas oficiais podem exigir seleção de download, e este ambiente de execução não conseguiu baixar os arquivos binários externos. Portanto, não afirmamos que o protótipo tenha 789 MB. O tamanho de 789 MB é uma meta de pacote futura, não o tamanho atual.

### Plano de conteúdo
- Cidade e construções: 250–350 MB
- Personagens, animações e cães: 80–140 MB
- Texturas e materiais PBR: 180–240 MB
- Áudio e vozes: 60–100 MB
- Efeitos, variações e margens: restante até a meta
Os números são metas de planejamento, não tamanhos reais dos downloads; revise depois de escolher os assets.


## Central de downloads de recursos
No menu do jogo, use **CENTRAL DE DOWNLOADS DE ASSETS** para abrir `ASSET_CATALOG.html`. A página reúne links para as fontes oficiais; em cada site, toque em baixar e escolha o formato/resolução disponível. Muitos links abrem páginas de catálogo, não arquivos ZIP diretos, porque o próprio site exige selecionar o pacote. O protótipo não instala automaticamente esses arquivos no jogo: eles ainda precisam ser importados e otimizados.


## Protótipo 0.4.2 — downloads automáticos no cache do navegador

O menu agora tem um gerenciador de conteúdo. Ao escolher um pacote, o jogo consulta a API pública do Poly Haven, localiza URLs diretas e guarda os arquivos baixados no Cache Storage `grey-eyes-content-v1`. O service worker tenta servir esses URLs a partir do cache em acessos futuros.

**Limites reais:** requer HTTPS ou localhost; depende de CORS, disponibilidade da API e espaço/quota do navegador; há um limite de 120 MB por operação. O cache não é uma pasta de arquivos visível e o navegador pode removê-lo. Os arquivos armazenados ainda precisam ser ligados aos objetos do cenário para aparecerem no mundo 3D. Os kits Kenney e áudios Freesound continuam no catálogo porque suas páginas não são links diretos de arquivo.

A API Poly Haven exige um crédito visível “Powered by Poly Haven”. Os assets Poly Haven são CC0 segundo a documentação oficial: https://github.com/Poly-Haven/Public-API.


## Integração automática de modelos (0.4.4)

- Ao terminar um download, o jogo dispara um evento interno de atualização.
- Modelos GLB guardados no Cache Storage são lidos e carregados com o loader glTF/GLB do Babylon.js.
- Até seis modelos são colocados em pontos próximos do jogador, com escala normalizada.
- Modelos que não sejam GLB, texturas soltas e arquivos sem dependências resolvidas não são automaticamente aplicados aos materiais.
- O navegador precisa permitir CORS no download original e armazenamento suficiente. A integração ainda precisa de testes com cada arquivo real e em cada navegador.


## Versão 0.4.5 — correção do download

- O painel agora mostra uma mensagem clara se o jogo estiver aberto como `file://` ou sem conexão.
- Testa a API do Poly Haven antes de iniciar a fila de arquivos.
- Corrige a seleção de arquivos de modelos GLB e glTF; para glTF, tenta baixar os arquivos auxiliares da mesma pasta.
- Guarda o índice de modelos depois de cada download e permite carregar os modelos pelo botão “CARREGAR MODELOS NO CENÁRIO 3D”.
- A integração usa a URL original do glTF para preservar os caminhos relativos de texturas e arquivos binários.
- O cache foi atualizado para evitar que o Service Worker continue servindo a versão antiga do script.

**Requisito importante:** em iPad/Safari, abrir o `index.html` diretamente de Arquivos ou de dentro do ZIP não é um contexto seguro e o navegador bloqueia o armazenamento persistente. Hospede a pasta em HTTPS (por exemplo, GitHub Pages) e abra o endereço HTTPS; é necessário internet para o primeiro download. A API e os servidores externos também podem recusar uma solicitação, e o painel agora mostra esse erro em vez de parecer que nada aconteceu.

Os downloads continuam limitados a aproximadamente 120 MB por operação para reduzir risco de travamento. Não é um pacote de 789 MB ainda.
