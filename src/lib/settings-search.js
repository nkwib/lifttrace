/**
 * Settings search: one matcher for the index, the rail and the section
 * components. A query is folded (case + accents) and split on whitespace;
 * every token must appear somewhere in the section's localized title or its
 * keywords, in any order.
 */
import { foldText } from './search-text.js';

export const SECTION_KEYWORDS = {
  profile:        ['profile','my profile','account','user','name','nickname','birthday','dob','date of birth','gender','sex','male','female','height','cm','centimetres','feet','foot','inches','weight','lbs','kg','body','about you','sign out','logout','log out','password','change password','email','two-step sign-in','two-step','two step','2fa','mfa','two-factor','two factor','totp','authenticator','authenticator app','one-time code','recovery code','recovery codes','sign out everywhere','sign out all devices','sign out other devices','other devices','sessions','stolen session'],
  appearance:     ['appearance','theme','dark','light','accent','colour','color','custom','navigation','sidebar','persistent','start page','banner','animation','animations','motion','reduce','force mobile','mobile layout','mobile view','phone layout','narrow layout','desktop'],
  workout:        ['workout','weekly','goal','goals','celebration','celebrations','screen','keep awake','keep-awake','wake lock','rest','timer','rest timer','countdown','duration','alert','vibrate','tone','sound','do not disturb','dnd','alarm','alarm volume','silent mode','calorie','calories','kcal','burn','burned','estimate','cardio','cardio minutes','weekly cardio','track cardio','enable cardio','bike','run','row','treadmill','video','videos','clip','clips','set video','film','filming','footage','form check','technique','storage','disk','space','delete clips','rpe','rir','effort','reps in reserve','plate','plates','plate split','warm-up','warmup','superset','auto-fill','autofill','haptic'],
  units:          ['language','languages','units','measurement','measurement system','format','date','time','12h','24h','locale','region','regional','weight unit','height unit','lbs','kg','cm','ft','imperial','metric','week','week start','first day','first day of week','monday','sunday','calendar'],
  statistics:     ['statistics','stats','chart','bar','line','average','trend','y-axis','zero','calorie','calories','kcal','heatmap'],
  trace:          ['trace','ai','assistant','test connection','connection','failed to fetch','cors','v1','without','chat','provider','model','custom model','model id','claude','openai','gemini','sonnet','opus','haiku','fable','gpt','gpt-6','luna','sol','terra','gemini 3','flash','flash lite','pro preview','ollama','lm studio','deepseek','groq','localai','vllm','llama.cpp','mistral','base url','oai-compat','openai compatible','api key','rapidapi','artificial intelligence','bot','voice','hold to record','smart log','smart add','microphone','speech','attach','image','voice language','voice input','language','environment','env','locked'],
  radio:          ['radio','music','player','subsonic','navidrome','jellyfin','streaming','audio','playlist'],
  federation:     ['federation','nutritrace','nt','sync','integration','calorie sync','log workouts','log calories','api','api token','access token','instance','wearable','double count'],
  catalog:        ['catalog','catalogue','exercise','exercises','source','sources','wger','free','db','exercisedb','rapidapi','import','sync','library','custom','custom exercise','custom exercises','my exercises','create exercise','offline','offline exercise library','image cache'],
  data:           ['data','export','import','backup','reset','json','defaults','local backup','full backup','restore','schedule'],
  workoutImport:  ['import','workout','strong','hevy','fitnotes','jefit','garmin','fit','fit file','garmin connect','watch','strength training','migration','csv'],
  notifications:  ['notifications','reminders','workout reminder','rest day','streak','push','gotify','ntfy','apprise','celebration','pr','weekly summary','alert','permission','channel','sound','vibrate','vibration','battery','low battery','android','coaching','coach','client','request','coaching request','recommendation','new recommendation','prescription','answer','client answer','accepted','declined','left','message','messages','new message','conversation','chat','email me too','coaching email'],
  email:          ['email','smtp','mail','host','port','tls','password reset','invite','test','test email','send test','recipient','change password','stored password'],
  users:          ['users','user management','accounts','login','admin','trainer','member','client','clients','coach','coaching','request','coaching request','pairing','pairings','end coaching','register','invite','session','my profile','account','biometric','fingerprint','face','two-step sign-in','require two-step','require for everyone','reset two-step','2fa','mfa','two-factor','authenticator'],
  authentication: ['authentication','auth','sso','single sign-on','single sign on','oidc','openid','authentik','keycloak','authelia','pocket id','auth0','google','password login','admin group','provider','client id','client secret','discovery','discovery url','redirect uri','callback','env lock'],
  apiTokens:      ['api','api tokens','token','tokens','personal access token','pat','mcp','model context protocol','bearer','integration','integrations','external','third-party','third party','claude desktop','agent','scope','scopes','revoke','token expiry','expires','expiry'],
  webhooks:       ['webhook','webhooks','outgoing webhook','automation','automations','home assistant','n8n','integration','integrations','event','events','signature','hmac','secret','payload','pr','personal record','workout completed','program advanced','test webhook'],
  serverConnection: ['server','connection','sync','cloud','local','remote','connect','disconnect','url','http','https','plain http','not encrypted','unencrypted','encryption','last sync','log out','logout','sign out','sign in','sso','single sign-on','oidc','proxy'],
  updates:        ['updates','update','upgrade','version','new version','changelog','release','releases','apk','install','download','check for updates','auto-check','channel','stable','dev','dev-latest','beta','github','server update','docker','compose','docker-compose','check frequency','check interval','how often','hourly','daily','manual','manual only','cadence','banner','notification'],
  helpImprove:    ['diagnostics','logs','log','verbose','debug','bug','troubleshoot','report','clipboard'],
  support:        ['support','donate','donation','sponsor','github sponsors','ko-fi','kofi','tip','star','report a bug','bug','translate','weblate','help'],
  about:          ['about','version','lifttrace','license','sister','nutritrace'],
};

const tokens = (q) => foldText(q).trim().split(/\s+/).filter(Boolean);

/** Fold a section's title and keywords once into a searchable haystack. */
export function buildHaystack({ title = '', keywords = [] } = {}) {
  return [title, ...keywords].map(foldText).join('|');
}

/** True when every whitespace token of `query` is in the haystack. Empty query matches. */
export function matchesHaystack(query, haystack) {
  return tokens(query).every(t => haystack.includes(t));
}

export function matchesSection(query, section) {
  return matchesHaystack(query, buildHaystack(section));
}
