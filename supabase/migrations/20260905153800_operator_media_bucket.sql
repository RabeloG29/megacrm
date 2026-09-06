-- ============================================================================
-- 20260905153800_operator_media_bucket
-- ----------------------------------------------------------------------------
-- INCIDENTE: send-operator-media exigia SEMPRE uma Zernio API Key (mesmo para
-- conversas de canais UAZAPI, que não usam Zernio pra nada) só para hospedar o
-- arquivo e conseguir um attachmentUrl. Orgs 100% UAZAPI (sem número oficial
-- conectado no Zernio) nunca configuram essa chave — resultado: TODO envio de
-- mídia (áudio/vídeo/pdf/imagem) pelo operador quebrava com 502 "Zernio API Key
-- nao configurada", mesmo a mensagem de texto simples funcionando normalmente
-- (send-operator-message não depende do Zernio pra conversas UAZAPI).
--
-- Fix: bucket público próprio pra mídia do operador. Quando a conversa é
-- UAZAPI, a Edge Function sobe o arquivo aqui (Supabase Storage) em vez de
-- chamar o Zernio — mesmo padrão já usado e comprovado em
-- 20260903130000_scripts_attachments.sql. Conversas Zernio (Meta oficial)
-- continuam subindo pro Zernio normalmente (a Meta exige hospedagem lá).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-hub-operator-media', 'whatsapp-hub-operator-media', true, 25 * 1024 * 1024, NULL
  )
  ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;

          -- Leitura pública (bucket público; a URL é reenviada ao contato via UAZAPI).
          -- Escrita só pela Edge Function (service role, ignora RLS) — sem policy de
          -- insert/update/delete pro cliente autenticado, diferente do bucket de scripts.
          DROP POLICY IF EXISTS wh_operator_media_read ON storage.objects;
          CREATE POLICY wh_operator_media_read
          ON storage.objects
          FOR SELECT TO anon, authenticated
          USING (bucket_id = 'whatsapp-hub-operator-media');
          -- ============================================================================
          -- 20260905153800_operator_media_bucket
          -- ----------------------------------------------------------------------------
          -- INCIDENTE: send-operator-media exigia SEMPRE uma Zernio API Key (mesmo para
          -- conversas de canais UAZAPI, que não usam Zernio pra nada) só para hospedar o
          -- arquivo e conseguir um attachmentUrl. Orgs 100% UAZAPI (sem número oficial
          -- conectado no Zernio) nunca configuram essa chave — resultado: TODO envio de
          -- mídia (áudio/vídeo/pdf/imagem) pelo operador quebrava com 502 "Zernio API Key
          -- nao configurada", mesmo a mensagem de texto simples funcionando normalmente
          -- (send-operator-message não depende do Zernio pra conversas UAZAPI).
          --
          -- Fix: bucket público próprio pra mídia do operador. Quando a conversa é
          -- UAZAPI, a Edge Function sobe o arquivo aqui (Supabase Storage) em vez de
          -- chamar o Zernio — mesmo padrão já usado e comprovado em
          -- 20260903130000_scripts_attachments.sql. Conversas Zernio (Meta oficial)
          -- continuam subindo pro Zernio normalmente (a Meta exige hospedagem lá).
          -- ============================================================================

          INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
          VALUES (
            'whatsapp-hub-operator-media', 'whatsapp-hub-operator-media', true, 25 * 1024 * 1024, NULL
            )
            ON CONFLICT (id) DO UPDATE
            SET public = EXCLUDED.public,
                file_size_limit = EXCLUDED.file_size_limit,
                    allowed_mime_types = EXCLUDED.allowed_mime_types;

                    -- Leitura pública (bucket público; a URL é reenviada ao contato via UAZAPI).
                    -- Escrita só pela Edge Function (service role, ignora RLS) — sem policy de
                    -- insert/update/delete pro cliente autenticado, diferente do bucket de scripts.
                    DROP POLICY IF EXISTS wh_operator_media_read ON storage.objects;
                    CREATE POLICY wh_operator_media_read
                    ON storage.objects
                    FOR SELECT TO anon, authenticated
                    USING (bucket_id = 'whatsapp-hub-operator-media');
                    