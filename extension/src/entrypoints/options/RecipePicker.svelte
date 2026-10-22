<script lang="ts">
  import { onMount } from 'svelte';
  import type { Workspace } from '../../rule-model/schema';
  import Field from '../../ui/Field.svelte';
  import { installRecipe, RECIPES } from '../../workspace-ui/recipes';

  let { workspace, onadd }: { workspace: Workspace; onadd: (next: Workspace, groupId: string) => void } = $props();

  let selected = $state<string | undefined>();
  let values = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});

  const recipe = $derived(RECIPES.find((item) => item.id === selected));

  function select(id: string) {
    if (selected === id) {
      selected = undefined;
      values = {};
      errors = {};
      return;
    }
    const next = RECIPES.find((item) => item.id === id);
    if (!next) return;
    selected = id;
    values = Object.fromEntries(next.fields.map((field) => [field.id, field.defaultValue]));
    errors = {};
  }

  function setValue(id: string, value: string) {
    values = { ...values, [id]: value };
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!selected) return;
    const built = installRecipe(workspace, selected, values, () => crypto.randomUUID());
    if (!built.ok) {
      errors = built.errors;
      return;
    }
    errors = {};
    onadd(built.workspace, built.group.id);
  }

  onMount(() => {
    if (location.hash !== '#recipes') return;
    document.getElementById('recipes')?.scrollIntoView();
    document.querySelector<HTMLButtonElement>('#recipes button')?.focus();
  });
</script>

<section id="recipes" aria-labelledby="recipes-heading">
  <h2 id="recipes-heading">Recipes</h2>
  <p class="muted">Starter groups. Add one, edit it if you need to, then Save to apply it.</p>
  <ul>
    {#each RECIPES as item (item.id)}
      <li>
        <div>
          <h3>{item.name}</h3>
          <p class="muted">{item.summary}</p>
        </div>
        <button type="button" class="btn" aria-pressed={selected === item.id} onclick={() => select(item.id)}>
          {selected === item.id ? 'Selected' : 'Use this recipe'}
        </button>
      </li>
    {/each}
  </ul>

  {#if recipe}
    <form onsubmit={add}>
      {#each recipe.fields as field (field.id)}
        <Field id="recipe-{field.id}" label={field.label} hint={field.hint} error={errors[field.id] ?? ''}>
          {#snippet children({ describedby, invalid })}
            <input
              id="recipe-{field.id}"
              type="text"
              value={values[field.id] ?? ''}
              aria-describedby={describedby}
              aria-invalid={invalid}
              oninput={(event) => setValue(field.id, event.currentTarget.value)}
            />
          {/snippet}
        </Field>
      {/each}
      {#if errors.form}<p class="form-error" role="alert"><strong>Error:</strong> {errors.form}</p>{/if}
      <button type="submit" class="btn primary" id="recipe-add">Add to rules</button>
    </form>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  ul {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  li p {
    margin: 0;
    max-width: 40rem;
  }

  form {
    display: grid;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  .form-error {
    margin: 0;
    color: var(--danger);
  }
</style>
