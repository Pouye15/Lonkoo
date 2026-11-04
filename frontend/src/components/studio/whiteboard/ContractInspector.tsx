"use client";

import React, { useState } from "react";
import { CaretDown, CaretRight, Plus, Trash, X } from "@phosphor-icons/react";
import type { ArchitectureNode } from "@/lib/lonkoo-data";
import {
  AUTH_METHODS,
  BILLING_MODELS,
  FIELD_TYPES,
  HTTP_METHODS,
  LIMITS,
  MESSAGING_CHANNELS,
  PAYMENT_FLOWS,
  checkCurrency,
  checkIdent,
  checkPath,
  endpointsOf,
  entitiesOf,
  freshIdent,
  listOf,
  templatesCount,
  textOf,
  type Endpoint,
  type Entity,
  type Field,
} from "@/lib/canvas-contract";
import { contractTypeOf, defaultContract, type ContractType } from "@/lib/canvas-model";
import { cn } from "@/lib/cn";

type Contract = Record<string, unknown>;

const TYPE_LABEL: Record<ContractType, string> = {
  webapp: "Application web",
  service: "Service",
  database: "Base de données",
  auth: "Authentification",
  queue: "File de messages",
  "mobile-payment": "Paiement mobile",
  messaging: "Messagerie",
  billing: "Facturation",
  generic: "Bloc libre",
};

const AUTH_LABEL: Record<(typeof AUTH_METHODS)[number], string> = {
  github: "GitHub",
  password: "Mot de passe",
  "otp-sms": "Code reçu par SMS",
};
const CHANNEL_LABEL: Record<(typeof MESSAGING_CHANNELS)[number], string> = {
  sms: "SMS",
  ussd: "USSD",
  whatsapp: "WhatsApp",
  email: "Courriel",
};
const FLOW_LABEL: Record<(typeof PAYMENT_FLOWS)[number], string> = { collect: "Encaisser", payout: "Reverser" };
const MODEL_LABEL: Record<(typeof BILLING_MODELS)[number], string> = {
  subscription: "Abonnement",
  "one-time": "Paiement unique",
  usage: "À l'usage",
};

const ERROR_VISIBLE_MS = 6000;

const inputClass =
  "h-8 min-w-0 rounded-md border border-edge bg-surface px-2 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60";
const smallButton =
  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-subtle hover:text-ink disabled:pointer-events-none disabled:opacity-40";

/* ------------------------------------------------------------------ */
/* Champs                                                               */
/* ------------------------------------------------------------------ */

/**
 * Champ texte validé : la saisie reste locale tant qu'elle n'est pas validée (Entrée ou sortie du champ). Une saisie
 * refusée n'est jamais écrite dans le document partagé : le champ reprend sa valeur et dit pourquoi.
 */
function ValidatedInput({
  value,
  label,
  validate,
  normalize = (text) => text.trim(),
  onCommit,
  disabled,
  mono = true,
  maxLength,
  placeholder,
}: {
  value: string;
  label: string;
  validate: (text: string) => string | null;
  normalize?: (text: string) => string;
  onCommit: (text: string) => void;
  disabled?: boolean;
  mono?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const next = normalize(draft ?? value);
    setDraft(null);
    if (next === value) {
      setError(null);
      return;
    }
    const problem = validate(next);
    if (problem) {
      // Le champ a repris sa valeur : l'explication reste lisible quelques secondes, puis s'efface.
      setError(problem);
      window.setTimeout(() => setError(null), ERROR_VISIBLE_MS);
      return;
    }
    setError(null);
    onCommit(next);
  };

  return (
    <div className="min-w-0 flex-1">
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        value={draft ?? value}
        disabled={disabled}
        spellCheck={false}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(null);
            setError(null);
            event.currentTarget.blur();
          }
        }}
        className={cn("w-full", inputClass, mono && "font-mono", error && "border-danger")}
      />
      {error && (
        <p role="alert" className="mt-0.5 text-[11px] leading-tight text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function IdentInput({
  value,
  taken,
  ...rest
}: {
  value: string;
  /** Les autres identifiants de la même liste (l'unicité se contrôle dans la liste). */
  taken: readonly string[];
  label: string;
  onCommit: (text: string) => void;
  disabled?: boolean;
}) {
  return <ValidatedInput value={value} validate={(text) => checkIdent(text, taken)} {...rest} />;
}

function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn(inputClass, "pr-1", className ?? "w-full")}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      {children}
    </div>
  );
}

function AddButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-edge-strong text-xs font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      <Plus size={13} weight="bold" />
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Base de données : tables et champs                                   */
/* ------------------------------------------------------------------ */

function FieldRow({
  field,
  taken,
  readOnly,
  onChange,
  onDelete,
}: {
  field: Field;
  taken: readonly string[];
  readOnly: boolean;
  onChange: (field: Field) => void;
  onDelete: () => void;
}) {
  const flag = (key: "required" | "unique", on: boolean): Field => {
    const next = { ...field };
    if (on) next[key] = true;
    else delete next[key];
    return next;
  };
  return (
    <li className="space-y-1 rounded-md bg-sunken p-1.5">
      <div className="flex items-start gap-1">
        <IdentInput label="Nom du champ" value={field.name} taken={taken} disabled={readOnly} onCommit={(name) => onChange({ ...field, name })} />
        <SelectField
          label="Type du champ"
          value={field.type}
          options={FIELD_TYPES}
          disabled={readOnly}
          onChange={(type) => onChange({ ...field, type })}
          className="w-[5.5rem] flex-shrink-0 font-mono"
        />
        <button type="button" aria-label="Supprimer le champ" disabled={readOnly} onClick={onDelete} className={smallButton}>
          <Trash size={14} />
        </button>
      </div>
      <div className="flex items-center gap-4 pl-0.5 text-xs text-ink-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(field.required)} disabled={readOnly} onChange={(event) => onChange(flag("required", event.target.checked))} className="accent-accent" />
          Obligatoire
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(field.unique)} disabled={readOnly} onChange={(event) => onChange(flag("unique", event.target.checked))} className="accent-accent" />
          Unique
        </label>
      </div>
    </li>
  );
}

function EntitiesEditor({ entities, readOnly, onChange }: { entities: Entity[]; readOnly: boolean; onChange: (entities: Entity[]) => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(entities.length === 1 ? 0 : null);
  const names = entities.map((entity) => entity.name);

  const update = (index: number, entity: Entity) => onChange(entities.map((current, i) => (i === index ? entity : current)));

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-3">
        Les tables et leurs champs servent à générer les entités du projet. Les noms sont des identifiants : minuscules, chiffres et « _ ».
      </p>

      {entities.length === 0 && <p className="rounded-md bg-sunken px-2.5 py-2 text-xs text-ink-3">Aucune table pour l&apos;instant.</p>}

      <ul className="space-y-1.5">
        {entities.map((entity, index) => {
          const open = openIndex === index;
          const fieldNames = entity.fields.map((field) => field.name);
          return (
            <li key={index} className="rounded-lg border border-edge bg-surface">
              <div className="flex items-start gap-1 p-1.5">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={open ? "Replier la table" : "Déplier la table"}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className={smallButton}
                >
                  {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
                </button>
                <IdentInput
                  label="Nom de la table"
                  value={entity.name}
                  taken={names.filter((_, i) => i !== index)}
                  disabled={readOnly}
                  onCommit={(name) => update(index, { ...entity, name })}
                />
                <span className="flex h-8 flex-shrink-0 items-center font-mono text-[11px] text-ink-3">{entity.fields.length} ch.</span>
                <button
                  type="button"
                  aria-label="Supprimer la table"
                  disabled={readOnly}
                  onClick={() => {
                    onChange(entities.filter((_, i) => i !== index));
                    setOpenIndex(null);
                  }}
                  className={smallButton}
                >
                  <Trash size={14} />
                </button>
              </div>

              {open && (
                <div className="space-y-1.5 border-t border-edge-soft p-1.5">
                  <ul className="space-y-1.5">
                    {entity.fields.map((field, fieldIndex) => (
                      <FieldRow
                        key={fieldIndex}
                        field={field}
                        taken={fieldNames.filter((_, i) => i !== fieldIndex)}
                        readOnly={readOnly}
                        onChange={(next) => update(index, { ...entity, fields: entity.fields.map((f, i) => (i === fieldIndex ? next : f)) })}
                        onDelete={() => update(index, { ...entity, fields: entity.fields.filter((_, i) => i !== fieldIndex) })}
                      />
                    ))}
                  </ul>
                  <AddButton
                    disabled={readOnly || entity.fields.length >= LIMITS.fields}
                    title={entity.fields.length >= LIMITS.fields ? `${LIMITS.fields} champs au plus par table` : undefined}
                    onClick={() =>
                      update(index, { ...entity, fields: [...entity.fields, { name: freshIdent("champ", fieldNames), type: "string" }] })
                    }
                  >
                    Ajouter un champ
                  </AddButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AddButton
        disabled={readOnly || entities.length >= LIMITS.entities}
        title={entities.length >= LIMITS.entities ? `${LIMITS.entities} tables au plus par base` : undefined}
        onClick={() => {
          onChange([...entities, { name: freshIdent("table", names), fields: [] }]);
          setOpenIndex(entities.length);
        }}
      >
        Ajouter une table
      </AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Service : endpoints                                                  */
/* ------------------------------------------------------------------ */

function EndpointsEditor({ endpoints, readOnly, onChange }: { endpoints: Endpoint[]; readOnly: boolean; onChange: (endpoints: Endpoint[]) => void }) {
  const update = (index: number, endpoint: Endpoint) => onChange(endpoints.map((current, i) => (i === index ? endpoint : current)));

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-3">Les endpoints servent à générer les contrôleurs du projet et le contrat d&apos;API.</p>

      {endpoints.length === 0 && <p className="rounded-md bg-sunken px-2.5 py-2 text-xs text-ink-3">Aucun endpoint pour l&apos;instant.</p>}

      <ul className="space-y-1.5">
        {endpoints.map((endpoint, index) => (
          <li key={index} className="space-y-1 rounded-lg border border-edge bg-surface p-1.5">
            <div className="flex items-start gap-1">
              <SelectField
                label="Méthode HTTP"
                value={endpoint.method}
                options={HTTP_METHODS}
                disabled={readOnly}
                onChange={(method) => update(index, { ...endpoint, method })}
                className="w-[5.25rem] flex-shrink-0 font-mono"
              />
              <ValidatedInput
                label="Chemin de l'endpoint"
                value={endpoint.path}
                validate={checkPath}
                disabled={readOnly}
                placeholder="/produits"
                onCommit={(path) => update(index, { ...endpoint, path })}
              />
              <button type="button" aria-label="Supprimer l'endpoint" disabled={readOnly} onClick={() => onChange(endpoints.filter((_, i) => i !== index))} className={smallButton}>
                <Trash size={14} />
              </button>
            </div>
            <ValidatedInput
              label="Résumé de l'endpoint"
              value={endpoint.summary ?? ""}
              validate={() => null}
              mono={false}
              maxLength={LIMITS.summary}
              placeholder="Résumé (facultatif)"
              disabled={readOnly}
              onCommit={(summary) => {
                const next = { ...endpoint };
                if (summary) next.summary = summary;
                else delete next.summary;
                update(index, next);
              }}
            />
          </li>
        ))}
      </ul>

      <AddButton
        disabled={readOnly || endpoints.length >= LIMITS.endpoints}
        title={endpoints.length >= LIMITS.endpoints ? `${LIMITS.endpoints} endpoints au plus par service` : undefined}
        onClick={() => onChange([...endpoints, { method: "GET", path: "/ressource" }])}
      >
        Ajouter un endpoint
      </AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pages et topics                                                      */
/* ------------------------------------------------------------------ */

function IdentList({
  items,
  noun,
  nounPlural,
  base,
  limit,
  readOnly,
  onChange,
}: {
  items: string[];
  noun: string;
  nounPlural: string;
  base: string;
  limit: number;
  readOnly: boolean;
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="rounded-md bg-sunken px-2.5 py-2 text-xs text-ink-3">Aucune {noun} pour l&apos;instant.</p>}
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-1">
            <IdentInput
              label={`Nom de la ${noun}`}
              value={item}
              taken={items.filter((_, i) => i !== index)}
              disabled={readOnly}
              onCommit={(name) => onChange(items.map((current, i) => (i === index ? name : current)))}
            />
            <button type="button" aria-label={`Supprimer la ${noun}`} disabled={readOnly} onClick={() => onChange(items.filter((_, i) => i !== index))} className={smallButton}>
              <Trash size={14} />
            </button>
          </li>
        ))}
      </ul>
      <AddButton
        disabled={readOnly || items.length >= limit}
        title={items.length >= limit ? `${limit} ${nounPlural} au plus` : undefined}
        onClick={() => onChange([...items, freshIdent(base, items)])}
      >
        Ajouter une {noun}
      </AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau                                                              */
/* ------------------------------------------------------------------ */

interface ContractInspectorProps {
  /** Le bloc à décrire ; `null` : aucun bloc, ou plusieurs, sont sélectionnés. */
  node: ArchitectureNode | null;
  readOnly: boolean;
  onChange: (node: ArchitectureNode, contract: Contract) => void;
  onClose: () => void;
}

/** Inspecteur latéral : les champs du contrat propres au type du bloc sélectionné (tables, endpoints, pages…). */
export function ContractInspector({ node, readOnly, onChange, onClose }: ContractInspectorProps) {
  const type = node ? contractTypeOf(node.shape) : null;
  const contract: Contract = node && type ? { ...defaultContract(type), ...(node.contract ?? {}) } : {};
  const set = (patch: Contract) => {
    if (node) onChange(node, { ...contract, ...patch });
  };

  return (
    <aside
      aria-label="Propriétés du bloc"
      onPointerDown={(event) => event.stopPropagation()}
      className="flex w-[22rem] max-w-[45%] flex-shrink-0 flex-col border-l border-edge bg-surface"
    >
      <header className="flex items-center justify-between gap-2 border-b border-edge-soft px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{node ? node.title : "Propriétés"}</h2>
          {type && <p className="text-xs text-ink-3">{TYPE_LABEL[type]}</p>}
        </div>
        <button type="button" aria-label="Fermer les propriétés" onClick={onClose} className={smallButton}>
          <X size={14} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {readOnly && node && <p className="rounded-md bg-sunken px-2.5 py-1.5 text-xs text-ink-2">Lecture seule : votre rôle ne permet pas de modifier ces propriétés.</p>}

        {!node && <p className="text-sm text-ink-3">Sélectionnez un seul bloc pour voir ou modifier ses propriétés : tables, endpoints, pages…</p>}

        {node && type === "generic" && (
          <p className="text-sm text-ink-3">
            Un bloc libre (passerelle, cache, IA, utilisateur…) n&apos;a pas de propriétés propres : il n&apos;influence pas le code généré.
          </p>
        )}

        {node && type === "database" && (
          <EntitiesEditor entities={entitiesOf(contract)} readOnly={readOnly} onChange={(entities) => set({ entities })} />
        )}

        {node && type === "service" && (
          <EndpointsEditor endpoints={endpointsOf(contract)} readOnly={readOnly} onChange={(endpoints) => set({ endpoints })} />
        )}

        {node && type === "webapp" && (
          <Labelled label="Pages">
            <IdentList
              items={listOf(contract, "pages")}
              noun="page"
              nounPlural="pages"
              base="page"
              limit={LIMITS.pages}
              readOnly={readOnly}
              onChange={(pages) => set({ pages })}
            />
          </Labelled>
        )}

        {node && type === "queue" && (
          <Labelled label="Topics">
            <IdentList
              items={listOf(contract, "topics")}
              noun="topic"
              nounPlural="topics"
              base="topic"
              limit={LIMITS.topics}
              readOnly={readOnly}
              onChange={(topics) => set({ topics })}
            />
          </Labelled>
        )}

        {node && type === "auth" && (
          <Labelled label="Méthode d'authentification">
            <SelectField
              label="Méthode d'authentification"
              value={(AUTH_METHODS.find((m) => m === contract.method) ?? "password") as (typeof AUTH_METHODS)[number]}
              options={AUTH_METHODS}
              labels={AUTH_LABEL}
              disabled={readOnly}
              onChange={(method) => set({ method })}
            />
          </Labelled>
        )}

        {node && type === "messaging" && (
          <>
            <Labelled label="Canal">
              <SelectField
                label="Canal"
                value={(MESSAGING_CHANNELS.find((c) => c === contract.channel) ?? "sms") as (typeof MESSAGING_CHANNELS)[number]}
                options={MESSAGING_CHANNELS}
                labels={CHANNEL_LABEL}
                disabled={readOnly}
                onChange={(channel) => set({ channel })}
              />
            </Labelled>
            {templatesCount(contract) > 0 && (
              <p className="text-xs text-ink-3">
                {templatesCount(contract)} gabarit{templatesCount(contract) > 1 ? "s" : ""} de message, conservé{templatesCount(contract) > 1 ? "s" : ""} tel{templatesCount(contract) > 1 ? "s" : ""} quel{templatesCount(contract) > 1 ? "s" : ""} (non modifiable{templatesCount(contract) > 1 ? "s" : ""} ici).
              </p>
            )}
          </>
        )}

        {node && type === "mobile-payment" && (
          <>
            <Labelled label="Devise">
              <div className="flex">
                <ValidatedInput
                  label="Devise"
                  value={textOf(contract, "currency", "XOF")}
                  validate={checkCurrency}
                  normalize={(text) => text.trim().toUpperCase()}
                  maxLength={3}
                  disabled={readOnly}
                  onCommit={(currency) => set({ currency })}
                />
              </div>
            </Labelled>
            <Labelled label="Sens du flux">
              <SelectField
                label="Sens du flux"
                value={(PAYMENT_FLOWS.find((f) => f === contract.flow) ?? "collect") as (typeof PAYMENT_FLOWS)[number]}
                options={PAYMENT_FLOWS}
                labels={FLOW_LABEL}
                disabled={readOnly}
                onChange={(flow) => set({ flow })}
              />
            </Labelled>
          </>
        )}

        {node && type === "billing" && (
          <>
            <Labelled label="Modèle de facturation">
              <SelectField
                label="Modèle de facturation"
                value={(BILLING_MODELS.find((m) => m === contract.model) ?? "subscription") as (typeof BILLING_MODELS)[number]}
                options={BILLING_MODELS}
                labels={MODEL_LABEL}
                disabled={readOnly}
                onChange={(model) => set({ model })}
              />
            </Labelled>
            <Labelled label="Devise">
              <div className="flex">
                <ValidatedInput
                  label="Devise"
                  value={textOf(contract, "currency", "XOF")}
                  validate={checkCurrency}
                  normalize={(text) => text.trim().toUpperCase()}
                  maxLength={3}
                  disabled={readOnly}
                  onCommit={(currency) => set({ currency })}
                />
              </div>
            </Labelled>
          </>
        )}
      </div>
    </aside>
  );
}
