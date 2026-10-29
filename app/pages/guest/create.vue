<script setup lang="ts">
import { Link as LinkIcon } from '@lucide/vue'

const { t } = useI18n()
const { title } = useAppConfig()

useHead(() => ({
  title: `${t('home.guest_links.page_heading')} | ${title}`,
}))
</script>

<template>
  <section
    class="
      flex flex-1 items-center bg-background py-16 text-foreground
      md:py-24
    "
  >
    <div
      class="
        mx-auto grid w-full max-w-6xl items-center gap-12 px-6
        lg:grid-cols-2 lg:gap-16
      "
    >
      <div
        class="
          mx-auto max-w-xl text-center
          lg:mx-0 lg:text-left
        "
      >
        <Badge variant="outline" class="mb-5">
          <LinkIcon data-icon="inline-start" aria-hidden="true" />
          <span>{{ $t('home.guest_links.page_eyebrow') }}</span>
        </Badge>
        <h1
          class="
            text-4xl font-semibold tracking-tight text-balance
            md:text-5xl
            xl:text-6xl
          "
        >
          {{ $t('home.guest_links.page_heading') }}
        </h1>
        <p class="mt-6 text-lg/8 text-pretty text-muted-foreground">
          {{ $t('home.guest_links.page_description') }}
        </p>
      </div>

      <div class="mx-auto w-full max-w-xl">
        <HomeGuestLinkForm />
      </div>
    </div>
  </section>
</template>
