# 📑 SDD (Specification-Driven Development) - StoryGen Engine
## Versão: 1.1.0 · Sistema White-Label Multi-Tenant / Single-Tenant de Histórias Infantis com IA

---

## 1. Visão Geral e Escopo do Sistema

O **StoryGen Engine** é uma plataforma de software white-label multiplataforma desenvolvida para a criação, curadoria, monetização e consumo de histórias infantis personalizadas geradas por Inteligência Artificial (IA). O core da aplicação reside na capacidade de construir narrativas contextualizadas com base em universos criativos estruturados pelos usuários ou administradores.

### 1.1 Objetivos de Negócio (Dupla Abordagem)
O sistema deve ser compilável e configurável em dois modelos de produto totalmente distintos utilizando a mesma base de código através de variáveis de ambiente (`.env`):
1. **Modo Multi-Usuário (Ex: "Meu Universo"):** Um SaaS B2C baseado em assinaturas onde qualquer usuário cadastrado pode criar múltiplos universos independentes, gerenciar seus próprios personagens, assinar planos recorrentes e comercializar ou compartilhar suas histórias e universos de forma pública ou privada.
2. **Modo Universo Único (Ex: "Histórias da Gigi"):** Um produto focado na entrega de conteúdo centralizado de uma marca ou criador específico. Os administradores alimentam um único universo fixo com personagens proprietários, e múltiplos usuários finais assinam o app apenas para consumir as histórias geradas dinamicamente dentro deste ecossistema exclusivo.

---

## 2. Arquitetura de Software e Estratégia Multiplataforma

### 2.1 Stack Tecnológica Recomendada
* **Frontend/Mobile Unificado:** React Native + Expo (com suporte nativo a Expo Web / PWA).
* **Camada de Estilização:** NativeWind (Tailwind CSS adaptado para dispositivos móveis) ou Tamagui, assegurando design responsivo em resoluções mobile e desktops.
* **Backend e Infraestrutura:** Node.js (TypeScript) com arquitetura Serverless (Edge Functions) para orquestração de IA e comunicação com APIs externas.
* **Banco de Dados e Serviços:** Supabase ou Firebase (BaaS) operando sobre PostgreSQL para persistência relacional robusta.
* **Motor de IA:** Integração via SDK com OpenAI API (GPT-4o), omniroute ou Google Gemini API (Gemini 1.5 Pro).

### 2.2 Estrutura de Variáveis de Ambiente (`.env`)
O comportamento estrutural do aplicativo será controlado estritamente pelas diretrizes abaixo:

```ini
# Configuração White-Label Core
APP_MODE=MULTI # Opções válidas: MULTI | SINGLE
APP_NAME="Meu Universo"
APP_THEME_PRIMARY="#FF5A5F"
APP_THEME_SECONDARY="#3A2D54"

# Segurança e Compliance
LGPD_ENCRYPTION_KEY=d7a8f9b2c3d4e5f6a7b8c9d0e1f2a3b4
SOFT_DELETE_DEFAULT=true

# Integrações de Contexto Externo
OPENWEATHER_API_KEY=sua_chave_aqui
AI_ORCHESTRATOR_PROVIDER=gemini # Opções: openai | gemini
```

Personalizacao do aplicativo (icones, cores, logo) tambem pode ser pelo admin, tem que ter botao para push, compilacao, etc.

## 3. Requisitos Funcionais e Modos de Operação
### 3.1 Painel Administrativo Global (Super Admin)
Independentemente do modo ativo (MULTI ou SINGLE), o sistema possuirá uma área administrativa isolada e protegida por controle de acesso baseado em regras (RBAC).

Gestão de Planos e Cobranças: Criação de pacotes com limites estritos de uso (Ex: Plano Bronze: 1 Universo, 10 histórias/mês; Plano Ouro: Ilimitado).

Moderação de Conteúdo: Telas para auditoria, bloqueio e exclusão de universos, personagens, temas e histórias denunciadas ou inadequadas.

Gestão de Usuários e Moderadores: Controle total sobre contas ativas, suspensões temporárias e atribuição de papéis administrativos secundários.

Logs de Conformidade LGPD: Rastreamento de exclusões e auditoria de logs de anonimização.

### 3.2 Diferenciação de Fluxo: Modo MULTI vs. SINGLE
Modo MULTI (APP_MODE=MULTI)
Múltiplas contas de clientes finais criam dados isolados de forma isolada (multi-tenancy a nível de banco de dados).

Os universos e personagens criados por um usuário padrão não são visíveis para outros usuários por padrão.

Permite monetização por assinatura recorrente do criador para liberar recursos da plataforma de criação.

Usuários podem definir a visibilidade do seu universo/histórias como:

Pública: Visível para toda a plataforma no feed de descobertas.

Privada: Visível apenas para o criador e contas dependentes associadas.

Paga: Acesso ao conteúdo bloqueado por trás de uma paywall (sistema de moedas internas ou assinatura direta ao perfil do criador).

Modo SINGLE (APP_MODE=SINGLE)
A interface de criação de Universos e Personagens fica oculta para usuários finais e disponível estritamente para o Super Admin/Moderador.

O sistema inicializa apontando para o ID do Universo fixado na configuração do sistema.

Múltiplos usuários finais se cadastram apenas como consumidores das histórias daquele universo específico.

As histórias geradas podem ser configuradas como gratuitas ou acessíveis apenas por planos pagos.

## 4. Modelagem de Dados e Conformidade LGPD
Todos os registros do banco de dados utilizam Soft-Delete (as linhas contêm um campo deleted_at e nunca são eliminadas fisicamente no primeiro momento, respeitando períodos de retenção legal). Para conformidade com a LGPD, dados sensíveis e perfis de crianças associados a traços devem ser passíveis de anonimização completa sob requisição do usuário.

       +-------------------+             +-------------------+
       |       users       |1          * |   subscriptions   |
       |-------------------|-------------|-------------------|
       | id (PK)           |             | id (PK)           |
       | email             |             | user_id (FK)      |
       | deleted_at        |             | status            |
       +-------------------+             +-------------------+
                 | 1
                 |
                 | *
       +-------------------+             +-------------------+
       |     universes     |1          * |    themes         |
       |-------------------|-------------|-------------------|
       | id (PK)           |             | id (PK)           |
       | user_id (FK)      |             | universe_id (FK)  |
       | title             |             | title             |
       | location_context  |             +-------------------+
       | deleted_at        |                       | 1
       +-------------------+                       |
                 | 1                               | *
                 | * |
       +-------------------+             +-------------------+
       |    characters     |1          * |      stories      |
       |-------------------|-------------|-------------------|
       | id (PK)           |             | id (PK)           |
       | universe_id (FK)  |             | universe_id (FK)  |
       | name              |             | theme_id (FK)     |
       | classification    |             | story_arc_id (FK) |
       | traits            |             | content           |
       | deleted_at        |             | metadata_weather  |
       +-------------------+             +-------------------+

### 4.1 DDL (Data Definition Language) do Banco de Dados Relacional

```SQL
-- Extensão necessária para UUIDs funcionais
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Usuários
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'USER', -- USER, MODERATOR, ADMIN
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 2. Tabela de Planos de Assinatura
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    max_universes INT NOT NULL,
    max_stories_per_month INT NOT NULL,
    price_cents INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 3. Histórico de Assinaturas dos Usuários
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    plan_id UUID REFERENCES plans(id),
    status VARCHAR(50) NOT NULL, -- ACTIVE, CANCELED, PAST_DUE
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela de Universos (Pastas de Contexto)
CREATE TABLE universes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location_context VARCHAR(255) DEFAULT NULL, -- Cidade/Região para fins de geolocalização
    latitude NUMERIC(10, 7) DEFAULT NULL,
    longitude NUMERIC(10, 7) DEFAULT NULL,
    visibility VARCHAR(50) DEFAULT 'PRIVATE', -- PUBLIC, PRIVATE, PAID
    rating_score NUMERIC(3, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 5. Tabela de Personagens
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    universe_id UUID REFERENCES universes(id),
    name VARCHAR(255) NOT NULL,
    classification VARCHAR(100) NOT NULL, -- PRINCIPAL, SECUNDARIO, ANTAGONISTA, MASCOTE
    age_group VARCHAR(50), -- Idade aproximada ou ciclo biológico (Criança, Filhote, Adulto)
    traits TEXT[] NOT NULL, -- Lista de características textuais estruturadas
    image_url VARCHAR(512) DEFAULT NULL, -- URL da imagem armazenada no Cloud Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 6. Temas Narrativos Específicos do Universo
CREATE TABLE themes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    universe_id UUID REFERENCES universes(id),
    title VARCHAR(150) NOT NULL, -- Ex: "Superação do Medo do Escuro", "Amizade e Compartilhamento"
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 7. Arcos Narrativos (Para suporte a histórias contínuas/seriadas)
CREATE TABLE story_arcs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    universe_id UUID REFERENCES universes(id),
    title VARCHAR(255) NOT NULL, -- Nome do arco de histórias seguidas
    summary TEXT, -- Resumo acumulado do que aconteceu no arco até o momento
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 8. Tabela de Histórias Geradas
CREATE TABLE stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    universe_id UUID REFERENCES universes(id),
    theme_id UUID REFERENCES themes(id) DEFAULT NULL,
    story_arc_id UUID REFERENCES story_arcs(id) DEFAULT NULL, -- Vinculação se for contínua
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    prompt_used TEXT NOT NULL,
    visibility VARCHAR(50) DEFAULT 'PRIVATE', -- PUBLIC, PRIVATE, PAID
    metadata_weather JSONB DEFAULT NULL, -- Armazena { temp: 22, condition: "Chuvoso", time: "Noite" }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 9. Tabela de Interações e Colaborações entre Universos distintos
CREATE TABLE collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin_universe_id UUID REFERENCES universes(id),
    target_universe_id UUID REFERENCES universes(id),
    character_id UUID REFERENCES characters(id),
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## 5. Integração com IA e Geração Dinâmica de Contexto
Para evitar histórias idênticas ao clicar repetidamente no mesmo dia, o motor de prompt injetará dados variáveis coletados em tempo real na requisição da LLM.

Preciso poder controlar pelo administrador o prompt de cada motor, mas a ideia é ter um prompt base e injetar variáveis de contexto para enriquecer a geração. O sistema deve ser capaz de coletar dados contextuais relevantes, como clima e horário local do usuário, e injetá-los dinamicamente no prompt enviado para a IA, garantindo que as histórias geradas sejam únicas e adaptadas ao momento específico do dia, temas, contextos ou eventos atuais.

A principio por se tratar de um projeto de nicho infantil eu preciso controlar vocabular, temas e direcionamento pedagógico, mas a ideia é que o sistema seja flexível para permitir que o administrador defina variáveis de contexto adicionais e regras de injeção para personalizar ainda mais as histórias geradas. Isso pode incluir eventos sazonais, feriados, ou até mesmo dados de sensores IoT para criar narrativas altamente personalizadas e relevantes para o usuário final.

Lembrando que o sistema deve ser projetado para ser facilmente extensível, permitindo a adição de novos tipos de dados contextuais e regras de injeção sem a necessidade de reescrever grandes partes do código, garantindo assim uma evolução contínua e adaptabilidade às necessidades dos usuários e avanços tecnológicos.

Sendo assim o administrador geral da aplicação deve ter a capacidade de configurar o prompt base para cada motor de IA integrado, bem como definir as variáveis de contexto que serão coletadas e injetadas dinamicamente. Isso pode ser feito através de uma interface administrativa onde o administrador pode selecionar quais dados contextuais deseja incluir (como clima, horário, eventos atuais) e estabelecer regras para como esses dados devem ser formatados e incorporados no prompt enviado para a LLM.

### 5.1 Pipeline de Captura de Contexto Espaço-Temporal
Front-End: O app solicita acesso à geolocalização do usuário (coordenadas de latitude/longitude) e o horário local do dispositivo.

Back-End: Se as coordenadas forem enviadas, o back-end efetua uma requisição Http GET para uma API de meteorologia (OpenWeatherMap) antes de construir o prompt.

Fallback: Caso a permissão seja negada, o sistema assume uma variação estocástica randômica no prompt de tempo e clima.

### 5.2 Estrutura da Matriz de Prompt (Engine de Ingestão)
TypeScript
interface PromptContextInput {
  universe: { title: string; description: string };
  characters: Array<{ name: string; classification: string; traits: string[]; age_group: string }>;
  theme?: string;
  weather: { temperature: string; condition: string; current_time: string };
  narrative_type: 'STANDALONE' | 'CONTINUOUS';
  previous_summary?: string; // Obrigatório se CONTINUOUS
  user_guidance?: string; // Notas ou direcionamento inseridos manualmente pelo pai/mãe
}
Modelo de Prompt Injetado no Sistema Interno:

```Plaintext
[ROLE]
Você é um escritor premiado de literatura infantil e psicopedagogo. Seu objetivo é estruturar narrativas lúdicas, ricas em imaginação e seguras para crianças de todas as idades.

[CONTEXTO DO UNIVERSO]
Universo Criativo: {input.universe.title}
Diretrizes Ambientais: {input.universe.description}

[PERSONAGENS ATIVOS]
{input.characters.map(c => `- Nome: ${c.name} (${c.classification}). Idade/Ciclo: ${c.age_group}. Traços de Personalidade: ${c.traits.join(', ')}`)}

[CONTEXTO FÍSICO DO MUNDO REAL (INJEÇÃO DINÂMICA)]
- Momento da história: {input.weather.current_time}
- Clima lá fora: {input.weather.condition}
- Temperatura aproximada: {input.weather.temperature}°C
Atenção: Você DEVE integrar esses elementos físicos de clima e horário sutilmente dentro da narrativa para ancorar a imaginação da criança com o dia atual dela.

[ESTRUTURA DA NARRATIVA]
- Tipo de História: {input.narrative_type}
{input.narrative_type === 'CONTINUOUS' ? `ESTA É UMA HISTÓRIA CONTINUADA. Contexto dos capítulos anteriores a ser respeitado e expandido: ${input.previous_summary}` : 'Esta é uma história autônoma com começo, meio e fim estabelecidos.'}
- Tema pedagógico focado: {input.theme || "Exploração livre e criatividade"}
- Direcionamento específico do usuário: {input.user_guidance || "Nenhum direcionamento extra fornecido."}

[REGRAS CRÍTICAS DE OUTPUT]
1. Se a história for do tipo CONTINUOUS, finalize o capítulo com um gancho instigante para o próximo dia, sem encerrar o conflito central definitivamente.
2. O personagem marcado com a classificação "PRINCIPAL" deve liderar as resoluções da trama.
3. Retorne OBRIGATORIAMENTE um objeto JSON estrito, sem caracteres de escape adicionais ou tags de markdown, contendo a seguinte estrutura:
{
  "title": "Título criativo da história",
  "story_body": "O texto completo segmentado em parágrafos usando quebras de linha \\n.",
  "internal_summary_for_next_chapters": "Um resumo de 3 linhas focado em fatos mecânicos ocorridos nesta história para alimentar a memória da IA no próximo capítulo."
}
6. Workflow de Colaboração Cross-Universe (Interação Entre Mundos)
O sistema prevê uma arquitetura descentralizada de publicação em que personagens de um universo de terceiros podem fazer participações especiais.

[Universo Origem (Criador A)]
       │
       ▼
Seleciona Personagem + Solicita Colaboração com o Universo B
       │
       ▼
[Tabela de Collaborations]: Cria registro com status = 'PENDING'
       │
       ▼
[Notificação / Painel do Criador B]: Recebe solicitação de aprovação
       │
       ├──► SE REJEITADO: Status altera para 'REJECTED'. 
       │                  A história gerada fica visível APENAS para o Criador A (Privada)
       │
       └──► SE APROVADO: Status altera para 'APPROVED'.
                         A história ganha permissão de herança e pode ser listada publicamente em ambos os Universos.
```
## 7. Interfaces de API Essenciais (Endpoints para o Agente de Desenvolvimento)
Para garantir o desacoplamento e a integração perfeita com o front-end multi-plataforma, o back-end deve expor, no mínimo, as seguintes rotas RESTful ou equivalentes em Edge Functions:

### 7.1 POST /api/v1/stories/generate
Dispara o pipeline completo de geração de IA.

Payload de entrada:

```JSON
{
  "universe_id": "uuid-do-universo",
  "theme_id": "uuid-do-tema-opcional",
  "story_arc_id": "uuid-do-arco-opcional",
  "user_guidance": "Quero que hoje eles aprendam sobre escovar os dentes.",
  "geo": {
    "lat": -23.55052,
    "lng": -46.633308
  }
}
```
Resposta de sucesso (201 Created): Retorna o registro da tabela stories devidamente gravado e pronto para renderização na tela com componentes customizados de leitura infantil.

```JSON
{
  "id": "uuid-da-historia-criada",
  "title": "Gigi e o Clima Misterioso de São Paulo",
  "content": "Era uma noite chuvosa e fria com cerca de 22 graus...",
  "metadata_weather": {
    "temp": "22",
    "condition": "Chuvoso",
    "time": "Noite"
  }
}
```
### 7.2 DELETE /api/v1/users/:id
Ativa o fluxo de exclusão/anonimização em conformidade com a LGPD.

Regra interna: Atualiza o campo deleted_at para CURRENT_TIMESTAMP na tabela users e em cascata limpa o conteúdo de texto dos nomes de personagens e descrições substituindo por hashes imutáveis ([ANONIMIZADO_REG_XXXX]), impossibilitando engenharia reversa de dados de menores de idade se o usuário optar pela remoção integral do perfil.