<script setup lang="ts">
import { AlertCircle, Copy, ExternalLink, Link as LinkIcon, LoaderCircle } from '@lucide/vue'
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'

interface GuestLinkConfig {
  enabled: boolean
  prefix: string
  turnstileSiteKey: string
  expirationDays: number
}

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    'sitekey': string
    'action': string
    'callback': (token: string) => void
    'expired-callback': () => void
    'error-callback': () => void
  }) => string
  remove: (widgetId: string) => void
  reset: (widgetId: string) => void
}

interface GuestLinkResult {
  shortLink: string
  expiration?: number
}

const { t } = useI18n()
const config = shallowRef<GuestLinkConfig>()
const result = shallowRef<GuestLinkResult>()
const errorMessage = shallowRef('')
const challengeMessage = shallowRef('')
const challengeToken = shallowRef('')
const challengeContainer = ref<HTMLElement>()
const challengeWidgetId = shallowRef('')

function getTurnstile(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile
}

function loadTurnstile(): Promise<void> {
  if (getTurnstile())
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-sink-turnstile]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.sinkTurnstile = 'true'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true })
    document.head.appendChild(script)
  })
}

async function mountTurnstile() {
  if (!config.value?.enabled || !challengeContainer.value || challengeWidgetId.value)
    return

  try {
    await loadTurnstile()
    const turnstile = getTurnstile()
    if (!turnstile || !challengeContainer.value)
      throw new Error('Turnstile is unavailable')

    challengeWidgetId.value = turnstile.render(challengeContainer.value, {
      'sitekey': config.value.turnstileSiteKey,
      'action': 'guest_link_create',
      'callback': (token) => {
        challengeToken.value = token
        challengeMessage.value = ''
      },
      'expired-callback': () => {
        challengeToken.value = ''
      },
      'error-callback': () => {
        challengeToken.value = ''
        challengeMessage.value = t('home.guest_links.challenge_error')
      },
    })
  }
  catch (error) {
    console.error(error)
    challengeMessage.value = t('home.guest_links.challenge_error')
  }
}

const form = useForm({
  defaultValues: { url: '' },
  onSubmit: async ({ value }) => {
    errorMessage.value = ''
    result.value = undefined

    if (!challengeToken.value) {
      challengeMessage.value = t('home.guest_links.complete_challenge')
      return
    }

    try {
      const response = await $fetch<GuestLinkResult>('/_guest/links', {
        method: 'POST',
        body: {
          url: value.url.trim(),
          turnstileToken: challengeToken.value,
        },
      })
      result.value = response
      challengeToken.value = ''
      form.reset()
      if (challengeWidgetId.value)
        getTurnstile()?.reset(challengeWidgetId.value)
    }
    catch (error) {
      const fetchError = error as { statusCode?: number, statusMessage?: string, data?: { statusMessage?: string } }
      const statusMessage = fetchError.data?.statusMessage ?? fetchError.statusMessage ?? ''
      if (statusMessage === 'GUEST_DAILY_LIMIT_REACHED')
        errorMessage.value = t('home.guest_links.daily_limit')
      else if (statusMessage === 'GUEST_GLOBAL_LIMIT_REACHED')
        errorMessage.value = t('home.guest_links.global_limit')
      else
        errorMessage.value = t('home.guest_links.failed')

      challengeToken.value = ''
      if (challengeWidgetId.value)
        getTurnstile()?.reset(challengeWidgetId.value)
    }
  },
})

const isSubmitting = form.useStore(state => state.isSubmitting)

async function submitForm(event: SubmitEvent) {
  event.preventDefault()
  await form.handleSubmit()
}

async function copyShortLink() {
  if (!result.value)
    return

  try {
    await navigator.clipboard.writeText(result.value.shortLink)
    toast.success(t('home.guest_links.copied'))
  }
  catch {
    errorMessage.value = t('home.guest_links.copy_failed')
  }
}

onMounted(async () => {
  try {
    config.value = await $fetch<GuestLinkConfig>('/_guest/config')
    if (config.value.enabled)
      await nextTick(mountTurnstile)
  }
  catch (error) {
    console.error('[guest-links] Could not load public configuration', error)
  }
})

onUnmounted(() => {
  if (challengeWidgetId.value)
    getTurnstile()?.remove(challengeWidgetId.value)
})
</script>

<template>
  <section v-if="config?.enabled" class="mx-auto w-full max-w-3xl px-6 pb-16">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <LinkIcon aria-hidden="true" class="size-5" />
          {{ $t('home.guest_links.title') }}
        </CardTitle>
        <CardDescription>{{ $t('home.guest_links.description') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-5">
        <form class="space-y-4" :aria-busy="isSubmitting" @submit="submitForm">
          <FieldGroup>
            <Field>
              <FieldLabel for="guest-link-url">
                {{ $t('home.guest_links.url_label') }}
              </FieldLabel>
              <Input
                id="guest-link-url"
                type="url"
                name="url"
                autocomplete="url"
                inputmode="url"
                required
                :model-value="form.getFieldValue('url')"
                :placeholder="$t('home.guest_links.url_placeholder')"
                :disabled="isSubmitting"
                @update:model-value="value => form.setFieldValue('url', String(value))"
              />
            </Field>
          </FieldGroup>

          <div ref="challengeContainer" />
          <p v-if="challengeMessage" class="text-sm text-destructive" role="alert">
            {{ challengeMessage }}
          </p>

          <Alert v-if="errorMessage" variant="destructive" role="alert">
            <AlertCircle aria-hidden="true" class="size-4" />
            <AlertTitle>{{ errorMessage }}</AlertTitle>
          </Alert>

          <Button type="submit" :disabled="isSubmitting" :aria-busy="isSubmitting">
            <LoaderCircle
              v-if="isSubmitting"
              aria-hidden="true"
              class="
                size-4
                motion-safe:animate-spin
              "
            />
            <LinkIcon v-else aria-hidden="true" class="size-4" />
            {{ $t(isSubmitting ? 'home.guest_links.creating' : 'home.guest_links.create') }}
          </Button>
        </form>

        <div
          v-if="result"
          class="
            flex flex-col gap-3 rounded-lg border bg-muted/30 p-4
            sm:flex-row sm:items-center sm:justify-between
          "
          role="status"
          aria-live="polite"
        >
          <div class="min-w-0 space-y-1">
            <p class="text-sm font-medium">
              {{ $t('home.guest_links.short_link') }}
            </p>
            <a
              :href="result.shortLink"
              target="_blank"
              rel="noopener noreferrer"
              class="
                inline-flex max-w-full items-center gap-1 truncate font-mono
                text-primary underline underline-offset-4
              "
            >
              {{ result.shortLink }}
              <ExternalLink aria-hidden="true" class="size-3 shrink-0" />
            </a>
            <p class="text-xs text-muted-foreground">
              {{ config.expirationDays > 0
                ? $t('home.guest_links.expires_in', { days: config.expirationDays })
                : $t('home.guest_links.never_expires') }}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="shrink-0"
            :aria-label="$t('home.guest_links.copy')"
            @click="copyShortLink"
          >
            <Copy aria-hidden="true" class="size-4" />
            {{ $t('home.guest_links.copy') }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
