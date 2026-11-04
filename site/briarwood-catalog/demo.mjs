// Isolated demonstrations. These people/services do not exist and are never enrolled.
import {validateCard, sha256, HttpError} from './card.mjs';
const encode = value => new TextEncoder().encode(JSON.stringify(value,null,2) + '\n');
export const humanCard = {
  schema:'briarwood-card/1',catalog:'https://briarwood.ai/catalog',listed:true,
  name:'DEMO · The wedding makeup artist',
  offer:'Wedding makeup for a bride and wedding party in Napa. A fictional service for this preview.',
  card_url:'https://demo-artist.briarwood.ai/briarwood.json',
  terms:{scope:'Demonstration: bridal makeup and wedding-party makeup. Hair styling is a separate service.',time:'Example only: Saturday, 10:00–14:00 America/Los_Angeles. Confirm the actual date with the artist.',cost:'Illustrative quote: $200 per person, USD. Travel and extras are quoted before agreement.',consequences:'Example: changes and cancellation terms must be agreed in the written quote.',decision:'The client and artist confirm scope, time, price, and cancellation terms in writing before work or payment.'},
  contact:{url:'https://demo-artist.briarwood.ai/request',instructions:'Example: send your event date, venue, ready-by time, number of people, desired look, and budget. The artist replies with availability and a quote. This demonstration does not send a request.'},
  witness:{verification_url:'https://demo-artist.briarwood.ai/evidence',trusted_keys:[],limitations:'Fictional profile. No member key or witness evidence is published.'}
};
export const agentCard = {
  ...structuredClone(humanCard),name:'DEMO · The planning agent',
  offer:'Wedding planning schedules and service coordination for people and their agents. A fictional service for this preview.',
  card_url:'https://demo-agent.briarwood.ai/briarwood.json',
  terms:{scope:'Example: draft a schedule from your dates, venue, service needs, and budget.',time:'Example: ask for a turnaround estimate before agreeing.',cost:'Example: request a fixed quote. No payment is authorized by discovery.',consequences:'Example: schedule is a draft until the client and each provider confirm it.',decision:'Client approval is required before contacting providers, committing dates, or paying.'},
  service:{transport:'https',endpoint:'https://demo-agent.briarwood.ai/request',authentication:'Example endpoint only. No credentials exist.',instructions:'Send desired outcome, date/time zone, venue, guest count, services needed, and budget. Request a draft and a quote. Do not contact providers or spend without authorization.'}
};
delete agentCard.contact;

export async function createDemo({seed = true} = {}) {
  let revision = 0;
  let ledger = {schema:'briarwood-pointers/1',entries:[]};
  const cards = new Map([humanCard,agentCard].map(card => [card.card_url,structuredClone(card)]));
  async function loadCard(url) {
    const card = cards.get(url);
    if (!card) throw new HttpError(404,'demo_address_unknown','This preview accepts only its fictional example addresses. No network fetch was made.');
    const bytes = encode(card);
    return {card:validateCard(card,url),sha256:await sha256(bytes),bytes:bytes.length,fetched_at:'2026-10-22T04:00:00.000Z'};
  }
  const repository = {
    async read() {const bytes=encode(ledger);return {ledger:structuredClone(ledger),commit:'DEMO-' + revision,blob_sha:'DEMO',document_sha256:await sha256(bytes),commit_url:'DEMONSTRATION — no public commit',raw_url:'DEMONSTRATION — in-memory pointer document'};},
    async publish(observation) {
      const card=observation.card;
      const previous=ledger.entries.find(entry=>entry.card_url===card.card_url);
      if (previous?.card_sha256===observation.sha256) return {state:'unchanged',entry:structuredClone(previous),snapshot:await this.read()};
      const entry={id:await sha256(new TextEncoder().encode(card.card_url)),name:card.name,offer:card.offer,card_url:card.card_url,card_sha256:observation.sha256,listed_at:previous?.listed_at || observation.fetched_at,updated_at:observation.fetched_at,active:card.listed};
      ledger.entries=previous?ledger.entries.map(old=>old.id===entry.id?entry:old):[...ledger.entries,entry];revision++;
      return {state:!card.listed?'withdrawn':previous?'updated':'listed',entry:structuredClone(entry),snapshot:await this.read()};
    }
  };
  if(seed) for(const card of cards.values()) await repository.publish(await loadCard(card.card_url));
  return {repository,loadCard,cards};
}
