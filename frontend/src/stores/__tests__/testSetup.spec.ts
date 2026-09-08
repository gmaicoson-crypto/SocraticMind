import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineStore } from 'pinia'

const useTestStore = defineStore('p0-test-setup', {
  state: () => ({ ready: false }),
})

describe('P0 test setup', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('creates an isolated Pinia store', () => {
    const store = useTestStore()
    store.ready = true
    expect(store.ready).toBe(true)
  })
})
