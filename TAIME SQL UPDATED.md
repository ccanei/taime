\-- WARNING: This schema is for context only and is not meant to be run.  
\-- Table order and constraints may not be valid for execution.

CREATE TABLE public.sources (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  name text NOT NULL,  
  url text NOT NULL,  
  tier smallint NOT NULL DEFAULT 1 CHECK (tier \>= 1 AND tier \<= 3),  
  category text NOT NULL,  
  active boolean NOT NULL DEFAULT true,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  updated\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT sources\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.signals (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  source\_id uuid NOT NULL,  
  period date NOT NULL,  
  title text NOT NULL,  
  url text,  
  content text,  
  summary text,  
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,  
  collected\_at timestamp with time zone NOT NULL DEFAULT now(),  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  is\_noise boolean NOT NULL DEFAULT false,  
  CONSTRAINT signals\_pkey PRIMARY KEY (id),  
  CONSTRAINT signals\_source\_id\_fkey FOREIGN KEY (source\_id) REFERENCES public.sources(id)  
);  
CREATE TABLE public.signal\_clusters (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  period date NOT NULL,  
  name text NOT NULL,  
  description text,  
  signal\_ids ARRAY NOT NULL DEFAULT '{}'::uuid\[\],  
  llm\_reasoning text,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT signal\_clusters\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.reports (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  period date NOT NULL,  
  status text NOT NULL DEFAULT 'draft'::text CHECK (status \= ANY (ARRAY\['draft'::text, 'generating'::text, 'pending\_review'::text, 'published'::text, 'rejected'::text, 'archived'::text\])),  
  title\_pt\_br text,  
  title\_en text,  
  executive\_summary\_pt\_br text,  
  executive\_summary\_en text,  
  published\_at timestamp with time zone,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  updated\_at timestamp with time zone NOT NULL DEFAULT now(),  
  period\_label text,  
  period\_type text CHECK (period\_type \= ANY (ARRAY\['weekly'::text, 'biweekly'::text, 'monthly'::text\])),  
  period\_start date,  
  period\_end date,  
  report\_number integer DEFAULT 1,  
  validation\_verdict text CHECK (validation\_verdict IS NULL OR (validation\_verdict \= ANY (ARRAY\['pass'::text, 'needs\_review'::text, 'fail'::text, 'stale'::text\]))),  
  validation\_flags jsonb DEFAULT '\[\]'::jsonb,  
  validated\_at timestamp with time zone,  
  signal\_count integer,  
  embedding USER-DEFINED,  
  is\_public boolean NOT NULL DEFAULT false,  
  public\_unlocked\_rank integer,  
  CONSTRAINT reports\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.report\_trends (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  report\_id uuid NOT NULL,  
  signal\_cluster\_id uuid,  
  rank smallint NOT NULL CHECK (rank \>= 1 AND rank \<= 12),  
  title\_pt\_br text NOT NULL,  
  title\_en text NOT NULL,  
  taime\_score smallint NOT NULL CHECK (taime\_score \>= 0 AND taime\_score \<= 100),  
  taime\_score\_rationale\_pt\_br text NOT NULL,  
  taime\_score\_rationale\_en text NOT NULL,  
  taime\_framework\_pt\_br jsonb NOT NULL DEFAULT '{}'::jsonb,  
  taime\_framework\_en jsonb NOT NULL DEFAULT '{}'::jsonb,  
  then\_now\_next\_pt\_br jsonb NOT NULL DEFAULT '{}'::jsonb,  
  then\_now\_next\_en jsonb NOT NULL DEFAULT '{}'::jsonb,  
  org\_implications\_pt\_br jsonb NOT NULL DEFAULT '{}'::jsonb,  
  org\_implications\_en jsonb NOT NULL DEFAULT '{}'::jsonb,  
  decision\_triggers\_pt\_br ARRAY NOT NULL DEFAULT '{}'::text\[\],  
  decision\_triggers\_en ARRAY NOT NULL DEFAULT '{}'::text\[\],  
  recommended\_move\_pt\_br text,  
  recommended\_move\_en text,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  updated\_at timestamp with time zone NOT NULL DEFAULT now(),  
  score\_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,  
  category text,  
  theme\_slug text,  
  CONSTRAINT report\_trends\_pkey PRIMARY KEY (id),  
  CONSTRAINT report\_trends\_report\_id\_fkey FOREIGN KEY (report\_id) REFERENCES public.reports(id),  
  CONSTRAINT report\_trends\_signal\_cluster\_id\_fkey FOREIGN KEY (signal\_cluster\_id) REFERENCES public.signal\_clusters(id)  
);  
CREATE TABLE public.users (  
  id uuid NOT NULL,  
  email text NOT NULL UNIQUE,  
  full\_name text,  
  company text,  
  job\_title text,  
  preferred\_language text NOT NULL DEFAULT 'pt-BR'::text CHECK (preferred\_language \= ANY (ARRAY\['pt-BR'::text, 'en'::text\])),  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  updated\_at timestamp with time zone NOT NULL DEFAULT now(),  
  language\_set\_by\_user boolean NOT NULL DEFAULT false,  
  CONSTRAINT users\_pkey PRIMARY KEY (id),  
  CONSTRAINT users\_id\_fkey FOREIGN KEY (id) REFERENCES auth.users(id)  
);  
CREATE TABLE public.subscriptions (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  user\_id uuid NOT NULL UNIQUE,  
  stripe\_customer\_id text UNIQUE,  
  stripe\_subscription\_id text UNIQUE,  
  plan text NOT NULL DEFAULT 'free'::text CHECK (plan \= ANY (ARRAY\['free'::text, 'essential'::text, 'strategic'::text\])),  
  status text NOT NULL DEFAULT 'inactive'::text CHECK (status \= ANY (ARRAY\['active'::text, 'inactive'::text, 'trialing'::text, 'past\_due'::text, 'canceled'::text, 'unpaid'::text\])),  
  current\_period\_start timestamp with time zone,  
  current\_period\_end timestamp with time zone,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  updated\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT subscriptions\_pkey PRIMARY KEY (id),  
  CONSTRAINT subscriptions\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES public.users(id)  
);  
CREATE TABLE public.advisory\_memory (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  user\_id uuid NOT NULL,  
  session\_id uuid NOT NULL,  
  role text NOT NULL CHECK (role \= ANY (ARRAY\['user'::text, 'assistant'::text\])),  
  content text NOT NULL,  
  context\_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT advisory\_memory\_pkey PRIMARY KEY (id),  
  CONSTRAINT advisory\_memory\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES public.users(id)  
);  
CREATE TABLE public.waitlist (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  email text NOT NULL UNIQUE,  
  contacted boolean DEFAULT false,  
  created\_at timestamp with time zone DEFAULT now(),  
  name text,  
  company text,  
  role text,  
  interest text,  
  requested\_plan text DEFAULT 'free'::text,  
  status text DEFAULT 'pending'::text,  
  CONSTRAINT waitlist\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.contacts (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  name text NOT NULL,  
  email text NOT NULL,  
  message text NOT NULL,  
  created\_at timestamp with time zone DEFAULT now(),  
  CONSTRAINT contacts\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.advisor\_profiles (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  user\_id uuid NOT NULL UNIQUE,  
  company\_name text,  
  sector text,  
  company\_size text,  
  annual\_revenue text,  
  current\_infrastructure text,  
  strategic\_objective text,  
  maturity\_level text,  
  created\_at timestamp with time zone DEFAULT now(),  
  updated\_at timestamp with time zone DEFAULT now(),  
  CONSTRAINT advisor\_profiles\_pkey PRIMARY KEY (id),  
  CONSTRAINT advisor\_profiles\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES auth.users(id)  
);  
CREATE TABLE public.radar\_signals (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  title\_pt text NOT NULL,  
  title\_en text NOT NULL,  
  summary\_pt text NOT NULL,  
  summary\_en text NOT NULL,  
  category text NOT NULL,  
  relevance text NOT NULL CHECK (relevance \= ANY (ARRAY\['high'::text, 'medium'::text, 'low'::text\])),  
  source\_category text NOT NULL,  
  url text NOT NULL UNIQUE,  
  published\_at timestamp with time zone,  
  collected\_at timestamp with time zone DEFAULT now(),  
  CONSTRAINT radar\_signals\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.admins (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  email text NOT NULL UNIQUE,  
  created\_at timestamp with time zone DEFAULT now(),  
  CONSTRAINT admins\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.reading\_progress (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  user\_id uuid NOT NULL,  
  report\_id uuid NOT NULL,  
  scroll\_pct smallint NOT NULL DEFAULT 0 CHECK (scroll\_pct \>= 0 AND scroll\_pct \<= 100),  
  completed boolean NOT NULL DEFAULT false,  
  first\_read\_at timestamp with time zone NOT NULL DEFAULT now(),  
  last\_read\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT reading\_progress\_pkey PRIMARY KEY (id),  
  CONSTRAINT reading\_progress\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES auth.users(id),  
  CONSTRAINT reading\_progress\_report\_id\_fkey FOREIGN KEY (report\_id) REFERENCES public.reports(id)  
);  
CREATE TABLE public.report\_views (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  user\_id uuid NOT NULL,  
  report\_id uuid NOT NULL,  
  unlocked\_at timestamp with time zone DEFAULT now(),  
  CONSTRAINT report\_views\_pkey PRIMARY KEY (id),  
  CONSTRAINT report\_views\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES public.users(id),  
  CONSTRAINT report\_views\_report\_id\_fkey FOREIGN KEY (report\_id) REFERENCES public.reports(id)  
);  
CREATE TABLE public.radar\_briefings (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  briefing\_date date NOT NULL UNIQUE,  
  title\_pt text NOT NULL,  
  title\_en text NOT NULL,  
  body\_pt text NOT NULL,  
  body\_en text NOT NULL,  
  signal\_count integer DEFAULT 0,  
  signal\_ids ARRAY DEFAULT '{}'::uuid\[\],  
  created\_at timestamp with time zone DEFAULT now(),  
  CONSTRAINT radar\_briefings\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.newsletter\_subscribers (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  email text NOT NULL UNIQUE,  
  locale text DEFAULT 'pt-BR'::text,  
  status text DEFAULT 'active'::text CHECK (status \= ANY (ARRAY\['active'::text, 'blocked'::text, 'unsubscribed'::text, 'removed'::text\])),  
  source text DEFAULT 'radar'::text,  
  created\_at timestamp with time zone DEFAULT now(),  
  unsubscribe\_token uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  blocked\_reason text,  
  status\_changed\_at timestamp with time zone,  
  status\_changed\_by text,  
  CONSTRAINT newsletter\_subscribers\_pkey PRIMARY KEY (id)  
);  
CREATE TABLE public.feedback (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  user\_id uuid,  
  user\_email text,  
  type text NOT NULL DEFAULT 'suggestion'::text,  
  message text NOT NULL,  
  locale text DEFAULT 'pt-BR'::text,  
  status text DEFAULT 'new'::text,  
  created\_at timestamp with time zone DEFAULT now(),  
  CONSTRAINT feedback\_pkey PRIMARY KEY (id),  
  CONSTRAINT feedback\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES public.users(id)  
);  
CREATE TABLE public.saved\_reports (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  user\_id uuid NOT NULL,  
  report\_id bigint,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT saved\_reports\_pkey PRIMARY KEY (id),  
  CONSTRAINT saved\_reports\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES auth.users(id)  
);  
CREATE TABLE public.advisor\_sessions (  
  session\_id uuid NOT NULL,  
  user\_id uuid NOT NULL,  
  title text,  
  last\_activity\_at timestamp with time zone NOT NULL DEFAULT now(),  
  message\_count integer NOT NULL DEFAULT 0,  
  archived\_at timestamp with time zone,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT advisor\_sessions\_pkey PRIMARY KEY (session\_id),  
  CONSTRAINT advisor\_sessions\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES public.users(id)  
);  
CREATE TABLE public.newsletter\_sends (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  briefing\_id uuid,  
  briefing\_date date,  
  subject\_pt text,  
  subject\_en text,  
  body\_pt text,  
  body\_en text,  
  recipient\_count integer NOT NULL DEFAULT 0,  
  sent\_count integer NOT NULL DEFAULT 0,  
  failed\_count integer NOT NULL DEFAULT 0,  
  status text NOT NULL DEFAULT 'sent'::text CHECK (status \= ANY (ARRAY\['sent'::text, 'partial'::text, 'failed'::text, 'skipped'::text\])),  
  error text,  
  resend\_reference text,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT newsletter\_sends\_pkey PRIMARY KEY (id),  
  CONSTRAINT newsletter\_sends\_briefing\_id\_fkey FOREIGN KEY (briefing\_id) REFERENCES public.radar\_briefings(id)  
);  
CREATE TABLE public.newsletter\_send\_recipients (  
  id uuid NOT NULL DEFAULT gen\_random\_uuid(),  
  send\_id uuid NOT NULL,  
  subscriber\_id uuid,  
  email text NOT NULL,  
  locale text,  
  delivered boolean NOT NULL DEFAULT true,  
  error text,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT newsletter\_send\_recipients\_pkey PRIMARY KEY (id),  
  CONSTRAINT newsletter\_send\_recipients\_send\_id\_fkey FOREIGN KEY (send\_id) REFERENCES public.newsletter\_sends(id),  
  CONSTRAINT newsletter\_send\_recipients\_subscriber\_id\_fkey FOREIGN KEY (subscriber\_id) REFERENCES public.newsletter\_subscribers(id)  
);  
CREATE TABLE public.report\_trend\_embeddings (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  trend\_id uuid NOT NULL,  
  report\_id uuid NOT NULL,  
  period date NOT NULL,  
  rank smallint NOT NULL,  
  lang text NOT NULL CHECK (lang \= ANY (ARRAY\['pt'::text, 'en'::text\])),  
  theme\_slug text,  
  category text,  
  content text NOT NULL,  
  embedding USER-DEFINED,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT report\_trend\_embeddings\_pkey PRIMARY KEY (id),  
  CONSTRAINT report\_trend\_embeddings\_trend\_id\_fkey FOREIGN KEY (trend\_id) REFERENCES public.report\_trends(id),  
  CONSTRAINT report\_trend\_embeddings\_report\_id\_fkey FOREIGN KEY (report\_id) REFERENCES public.reports(id)  
);  
CREATE TABLE public.advisor\_session\_summaries (  
  id uuid NOT NULL DEFAULT uuid\_generate\_v4(),  
  session\_id uuid NOT NULL UNIQUE,  
  user\_id uuid NOT NULL,  
  summary text NOT NULL,  
  embedding USER-DEFINED,  
  created\_at timestamp with time zone NOT NULL DEFAULT now(),  
  updated\_at timestamp with time zone NOT NULL DEFAULT now(),  
  CONSTRAINT advisor\_session\_summaries\_pkey PRIMARY KEY (id),  
  CONSTRAINT advisor\_session\_summaries\_session\_id\_fkey FOREIGN KEY (session\_id) REFERENCES public.advisor\_sessions(session\_id),  
  CONSTRAINT advisor\_session\_summaries\_user\_id\_fkey FOREIGN KEY (user\_id) REFERENCES public.users(id)  
);  
