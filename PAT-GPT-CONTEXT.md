PROMPT — CORREÇÃO E FINALIZAÇÃO DO DASHBOARD ARDUINO PAT

Você está trabalhando no projeto "Dashboard Arduino" (Electron + React + TypeScript), versão atual 1.1.2.

OBJETIVO:
Transformar o aplicativo em um sistema real de monitoramento industrial, conectado fisicamente a um Arduino UNO por USB/Serial.

ATENÇÃO:
NÃO SIMULAR NENHUM DADO.
NÃO CRIAR VALORES FICTÍCIOS.
NÃO USAR PRESSÃO 1012 COMO VALOR DE SENSOR.
Todos os valores exibidos no dashboard devem vir do Arduino.

==================================================
1. HARDWARE REAL
==================================================

O Arduino UNO possui:

- 3 Termopares Tipo K
- 3 módulos MAX6675
- 1 sensor BME680

MAX6675:

Termopar 1:
DO = 12
CLK = 13
CS = 10

Termopar 2:
DO = 12
CLK = 13
CS = 9

Termopar 3:
DO = 12
CLK = 13
CS = 8

Os três MAX6675 compartilham:
- DO
- CLK
- VCC
- GND

Cada módulo possui seu próprio CS.

BME680:
- VCC = 5V
- GND = GND
- SDA = SDA do Arduino
- SCL = SCL do Arduino

O BME680 deve fornecer:
- Temperatura ambiente
- Umidade
- Pressão real
- Resistência do gás / VOC

A PRESSÃO DEVE SER A PRESSÃO REAL LIDA PELO BME680.

IMPORTANTE:
O dashboard atualmente mostra "Pressão (simulada)" e valor 1012 hPa.
REMOVER COMPLETAMENTE essa simulação.

Se o BME680 não enviar pressão válida:
- mostrar "Sem leitura"
- ou "N/A"
- nunca substituir automaticamente por 1012 hPa.

==================================================
2. CÓDIGO REAL DO ARDUINO
==================================================

O Arduino deve utilizar:

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include "MAX6675.h"

Configuração:

Adafruit_BME680 bme;

int thermoDO = 12;
int thermoCLK = 13;

MAX6675 sensor1(thermoCLK, 10, thermoDO);
MAX6675 sensor2(thermoCLK, 9, thermoDO);
MAX6675 sensor3(thermoCLK, 8, thermoDO);

O Arduino deve enviar UMA LINHA CSV por leitura, neste formato:

t1,t2,t3,temp,hum,press,voc

Exemplo:

125.4,98.2,210.7,26.3,58.0,955.6,125.4

Onde:

t1 = Termopar 1 °C
t2 = Termopar 2 °C
t3 = Termopar 3 °C
temp = temperatura ambiente °C
hum = umidade %
press = pressão REAL do BME680 em hPa
voc = resistência do gás em kΩ

Frequência:
1 leitura aproximadamente a cada 2 segundos.

O Arduino NÃO deve enviar somente dados simulados ou valores fixos.

Pode existir texto de debug no Serial Monitor, porém o formato de produção deve sempre emitir a linha CSV.

==================================================
3. PARSER DO ELECTRON
==================================================

Modificar o parser atual para aceitar exatamente:

t1,t2,t3,temp,hum,press,voc

Agora são 7 valores.

O parser deve interpretar:

índice 0 = t1
índice 1 = t2
índice 2 = t3
índice 3 = temperatura ambiente
índice 4 = umidade
índice 5 = pressão
índice 6 = VOC

Atualizar SensorPayload para:

{
  t1: number,
  t2: number,
  t3: number,
  temp: number,
  hum: number,
  pressure: number | null,
  voc: number,
  raw: string,
  ts: number
}

O sistema deve continuar tolerante a linhas inválidas.

Se uma leitura estiver inválida:
- não substituir por valor falso;
- manter último valor válido apenas se isso estiver claramente identificado na interface;
- registrar erro no console;
- informar o estado de comunicação.

==================================================
4. TRÊS TERMOPARES
==================================================

O dashboard atualmente mostra somente dois termopares.

ALTERAR PARA 3.

Criar:

Termopar 1
Termopar 2
Termopar 3

Cada card deve mostrar:

- temperatura atual
- unidade °C
- máximo registrado
- mínimo registrado
- indicação visual de atualização
- gráfico pequeno/sparkline se já existir no projeto

O histórico deve possuir as três curvas:

T1
T2
T3

Não remover nenhum termopar.

==================================================
5. BME680
==================================================

Criar/ajustar seção:

AMBIENTE (BME680)

Mostrar:

Temperatura Ambiente
Umidade
Pressão
VOC / Qualidade do Ar

A pressão deve ser:

bme.pressure / 100.0

porque o BME680 retorna pressão em Pa e o dashboard deve mostrar hPa.

Não usar:

1012
1013
valor médio
valor estimado
valor simulado

como fallback de pressão.

==================================================
6. VOC / QUALIDADE DO AR
==================================================

O BME680 fornece:

bme.gas_resistance

Converter para kΩ:

bme.gas_resistance / 1000.0

Mostrar:

VOC / Gases
valor em kΩ

Também mostrar uma classificação visual:

VOC > 100 kΩ:
Excelente

VOC > 60 kΩ:
Boa

VOC > 30 kΩ:
Moderada

VOC <= 30 kΩ:
Ruim

IMPORTANTE:
Esse índice é uma classificação baseada na resistência do gás do BME680.
Não apresentar como "PPM" sem calibração específica.

Mostrar no dashboard:

Qualidade do Ar / VOC
VOC / Gases
Índice de Qualidade do Ar

==================================================
7. COMUNICAÇÃO SERIAL
==================================================

Manter comunicação:

Arduino UNO → USB → COM → Electron → Dashboard

Baud padrão:

9600

Permitir configuração da porta COM.

Manter descoberta automática da porta Arduino.

O aplicativo deve identificar portas como:
- Arduino
- CH340
- CP210x
- USB serial

Manter reconexão automática caso:
- Arduino seja desconectado
- cabo USB seja removido
- Arduino seja reconectado
- COM seja alterada

Mostrar claramente:

CONECTADO
ou
DESCONECTADO

Mostrar também a porta:

COM3
COM4
etc.

==================================================
8. DASHBOARD
==================================================

Manter o design atual, mas corrigir a arquitetura para os dados reais.

Estrutura:

HEADER

Dashboard Arduino
Monitoramento industrial em tempo real

Status:
● Conectado
COMx

--------------------------------

TERMOPARES TIPO K

[ Termopar 1 ]
[ Termopar 2 ]
[ Termopar 3 ]

--------------------------------

AMBIENTE (BME680)

[ Temperatura ]
[ Umidade ]
[ Pressão ]

--------------------------------

QUALIDADE DO AR / VOC

[ VOC ]
[ Classificação ]

--------------------------------

HISTÓRICO

Gráfico:
T1
T2
T3

Opcionalmente gráfico ambiental.

--------------------------------

INTEGRAÇÃO ARDUINO

Console serial para diagnóstico.

Não alterar desnecessariamente o design existente.

==================================================
9. REMOVER MENU DO ELECTRON
==================================================

REMOVER completamente a barra:

File
Edit
View
Window

O aplicativo deve abrir sem a nav-bar tradicional do Electron.

Também remover acesso ao:

Developer Tools

O usuário final não deve conseguir abrir DevTools pelo menu.

Não deixar:
- File
- Edit
- View
- Window
- Developer Tools

visíveis.

Manter apenas a interface própria do Dashboard.

Não remover o DevTools do ambiente de desenvolvimento se isso for necessário para desenvolvimento interno, mas ele não deve estar disponível no aplicativo distribuído ao cliente.

==================================================
10. EXPORTAÇÃO PARA EXCEL
==================================================

Adicionar botão:

EXPORTAR

Permitir exportar os dados coletados para CSV compatível com Excel.

O arquivo deve conter:

Data
Hora
Termopar 1
Termopar 2
Termopar 3
Temperatura Ambiente
Umidade
Pressão
VOC
Qualidade do Ar

Exemplo:

Data;Hora;T1;T2;T3;Temperatura;Umidade;Pressão;VOC;Qualidade

Usar UTF-8 com BOM para abrir corretamente no Excel.

Nome sugerido:

Dashboard_Arduino_YYYY-MM-DD_HH-mm.csv

O usuário escolhe onde salvar.

==================================================
11. HISTÓRICO
==================================================

Manter histórico em memória durante a execução.

Cada amostra deve possuir timestamp.

Não perder a integridade dos dados quando a tela atualizar.

O gráfico deve mostrar:

T1
T2
T3

com atualização em tempo real.

==================================================
12. BACKUP AUTOMÁTICO
==================================================

Implementar sistema de backup.

BACKUP DE INÍCIO:

Quando o aplicativo iniciar uma sessão de monitoramento, criar um arquivo de backup da sessão anterior, caso exista.

BACKUP DE FIM:

Quando o aplicativo for fechado normalmente, salvar a sessão atual.

BACKUP MANUAL:

Adicionar uma opção:

"Fazer Backup Agora"

Quando solicitado, salvar imediatamente os dados atuais.

O backup deve conter todos os registros:

timestamp
T1
T2
T3
temperatura
umidade
pressão
VOC
qualidade do ar

Formato preferencial:
CSV ou JSON.

Sugestão de pasta:

Documentos/Dashboard Arduino/Backups/

Organizar por data.

Exemplo:

Backups/
  2026-08-11/
    inicio_2026-08-11_08-00-00.csv
    fim_2026-08-11_17-30-00.csv
    manual_2026-08-11_14-20-00.csv

Nunca apagar automaticamente backups anteriores sem confirmação.

==================================================
13. ATUALIZAÇÃO DO APLICATIVO
==================================================

O aplicativo será instalado nos computadores dos clientes.

Eu preciso conseguir corrigir e melhorar o aplicativo no meu computador e publicar uma nova versão no GitHub.

O aplicativo instalado no cliente deve detectar automaticamente nova versão.

Usar:

electron-updater
electron-builder
GitHub Releases

Manter:

owner:
Pat-termico

repo:
Pat

provider:
GitHub

O fluxo deve ser:

1. Eu altero o código em casa.
2. Aumento a versão no package.json.
3. Faço commit.
4. Crio tag da versão.
5. Faço push para GitHub.
6. GitHub Actions gera a release.
7. Publico a Release.
8. Aplicativo instalado no cliente detecta a nova versão.
9. Faz download do update.
10. Solicita/recomenda reinicialização.
11. Instala a nova versão.
12. Mantém os dados e backups do cliente.

NÃO reinstalar o aplicativo inteiro manualmente.

Usar atualização incremental quando possível.

IMPORTANTE:
Os dados do cliente NÃO podem ficar dentro da pasta da aplicação, pois uma atualização não pode apagar dados.

Salvar dados persistentes em uma pasta apropriada do usuário, por exemplo:

%APPDATA%/Dashboard Arduino/

ou:

Documentos/Dashboard Arduino/

Nunca armazenar histórico/backup dentro de:
- dist
- resources
- app.asar
- pasta temporária da aplicação

==================================================
14. PATCH / ATUALIZAÇÃO SEGURA
==================================================

A atualização deve preservar:

- configurações
- porta COM selecionada
- histórico salvo
- backups
- preferências
- arquivos exportados

Antes de atualizar, se possível:

1. salvar estado;
2. criar backup;
3. instalar atualização;
4. iniciar nova versão.

Se a atualização falhar, o aplicativo deve continuar iniciando na versão instalada anterior sempre que tecnicamente possível.

==================================================
15. VERSÃO
==================================================

Atualizar a versão de forma correta no:

package.json

Exemplo:

1.1.3
1.1.4
1.2.0

Não alterar versão aleatoriamente.

Usar Semantic Versioning:

MAJOR.MINOR.PATCH

==================================================
16. SEGURANÇA
==================================================

O aplicativo é para uso em cliente.

Manter:

contextIsolation: true
nodeIntegration: false

Não expor Node.js diretamente ao renderer.

Continuar usando preload/contextBridge.

Não permitir que conteúdo recebido da Serial execute código.

Os dados do Arduino devem ser tratados apenas como dados.

==================================================
17. TRATAMENTO DE ERROS
==================================================

Criar mensagens claras para:

Arduino desconectado
Porta COM ocupada
Porta COM inexistente
BME680 sem resposta
MAX6675 sem resposta
Termopar desconectado
Dados seriais inválidos
CSV inválido
Falha de backup
Falha de exportação
Falha de atualização

Não mostrar NaN no dashboard.

Se um MAX6675 retornar NaN, mostrar:

"Sem leitura"

ou:

"Termopar desconectado"

Não converter NaN para 0.

Isso é muito importante porque 0 °C pode ser uma temperatura real e não deve representar erro.

==================================================
18. CÓDIGO DO ARDUINO
==================================================

Considerar como protocolo oficial:

float t1 = sensor1.readCelsius();
float t2 = sensor2.readCelsius();
float t3 = sensor3.readCelsius();

float temp = bme.temperature;
float hum = bme.humidity;
float press = bme.pressure / 100.0;
float voc = bme.gas_resistance / 1000.0;

Serial.print(t1, 1);
Serial.print(",");
Serial.print(t2, 1);
Serial.print(",");
Serial.print(t3, 1);
Serial.print(",");
Serial.print(temp, 1);
Serial.print(",");
Serial.print(hum, 1);
Serial.print(",");
Serial.print(press, 1);
Serial.print(",");
Serial.println(voc, 1);

delay(2000);

Esse é o protocolo que o Electron deve interpretar.

==================================================
19. IMPORTANTE SOBRE PRESSÃO
==================================================

Existe atualmente no aplicativo algo semelhante a:

pressure: 1012

ou:

pressão simulada

REMOVER.

O valor precisa vir exclusivamente de:

bme.pressure / 100.0

Se o Arduino enviar:

955.6

o dashboard deve mostrar:

955.6 hPa

Se enviar:

1018.3

mostrar:

1018.3 hPa

Não modificar o valor.

==================================================
20. ENTREGA
==================================================

Antes de finalizar:

1. analisar a arquitetura existente;
2. não recriar o projeto do zero;
3. preservar componentes que já funcionam;
4. modificar apenas o necessário;
5. corrigir tipos TypeScript;
6. corrigir parser serial;
7. adicionar T3;
8. adicionar pressão real;
9. remover pressão simulada;
10. adicionar backup;
11. adicionar exportação CSV/Excel;
12. corrigir auto-update;
13. remover menu File/Edit/View/Window;
14. bloquear DevTools na versão de produção;
15. manter comunicação real com Arduino.

Executar:

npm run lint

Depois:

npm run build:renderer

Depois:

npm run build:win

Corrigir TODOS os erros encontrados.

Não considerar a tarefa concluída apenas porque compila.

==================================================
21. TESTE OBRIGATÓRIO
==================================================

Criar/testar com uma linha real:

125.4,98.2,210.7,26.3,58.0,955.6,125.4

O dashboard deve apresentar:

Termopar 1 = 125.4 °C
Termopar 2 = 98.2 °C
Termopar 3 = 210.7 °C
Temperatura = 26.3 °C
Umidade = 58.0 %
Pressão = 955.6 hPa
VOC = 125.4 kΩ

Não deve aparecer:

Pressão simulada
1012 hPa fixo
Termopar 3 ausente
VOC simulado

==================================================
22. RESULTADO FINAL ESPERADO
==================================================

Quero um aplicativo desktop Windows profissional para monitoramento real.

FLUXO:

Arduino UNO
↓
3 MAX6675
↓
3 Termopares Tipo K

e

Arduino UNO
↓
BME680
↓
Temperatura + Umidade + Pressão + VOC

Tudo:

↓
USB Serial
↓
Electron
↓
Parser
↓
React Dashboard
↓
Histórico
↓
Exportação
↓
Backup

O sistema deve funcionar SEM dados simulados.

PRIORIDADE ABSOLUTA:

1. Dados reais do Arduino
2. 3 termopares funcionando
3. BME680 funcionando
4. Pressão REAL
5. VOC real
6. Comunicação serial confiável
7. Histórico
8. Backup
9. Exportação Excel/CSV
10. Auto-update pelo GitHub
11. Interface limpa sem menu Electron
12. Sem DevTools para cliente

Ao terminar, apresente um resumo objetivo:
- arquivos alterados;
- funcionalidades implementadas;
- problemas encontrados;
- testes executados;
- resultado do lint;
- resultado do build;
- como gerar a próxima versão/release;
- como o cliente receberá a atualização.
