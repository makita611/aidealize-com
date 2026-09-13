document.documentElement.classList.add('js');
// 本番ホストのみ計測。ローカルレビューは集計しない。
if(location.hostname==='aidealize.com'){
  window.dataLayer=window.dataLayer||[];
  window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
  const tag=document.createElement('script');tag.async=true;tag.src='https://www.googletagmanager.com/gtm.js?id=GTM-P6VNBWH3';document.head.appendChild(tag);
  document.querySelectorAll('a[href*="utm_source=yui_portfolio"]').forEach(a=>a.addEventListener('click',()=>window.dataLayer.push({event:'portfolio_contact_click',portfolio_name:'yui',page_path:location.pathname})));
}
const menu=document.querySelector('.menu'),nav=document.querySelector('.nav');
if(menu&&nav){const close=()=>{menu.setAttribute('aria-expanded','false');nav.classList.remove('open');menu.textContent='MENU ☰'};menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);menu.textContent=open?'CLOSE ×':'MENU ☰'});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){close();menu.focus()}});window.matchMedia('(min-width:681px)').addEventListener('change',e=>{if(e.matches)close()})}
if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.remove('pending');observer.unobserve(e.target)}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('pending');observer.observe(el)})}
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));const night=button.dataset.scene==='night';document.querySelector('.scene').classList.toggle('is-night',night);document.querySelector('.scene-label').textContent=night?'夕景｜庭から、家の灯りを眺める。':'昼景｜窓辺で、庭の気配を感じる。'}));
// 「結」相談フォーム：新規/改修の選択とサイトURLを、相談リンクへ引き継ぐ
(()=>{
  const form=document.getElementById('leadForm');if(!form)return;
  const toggle=form.querySelectorAll('.lead-toggle button'),urlField=form.querySelector('[data-field="url"]'),urlInput=form.querySelector('#currentUrl'),submit=document.getElementById('leadSubmit');
  const campaign=new URLSearchParams(location.search).get('utm_campaign')||form.dataset.campaign||'web_production';
  let kind='new';
  function updateHref(){
    const url=new URL(submit.getAttribute('href'),location.href);
    url.searchParams.set('utm_campaign',campaign);
    url.searchParams.set('inquiry_type',kind);
    if(kind==='renovation'&&urlInput.value.trim())url.searchParams.set('current_site',urlInput.value.trim());
    else url.searchParams.delete('current_site');
    submit.setAttribute('href',url.toString());
  }
  toggle.forEach(btn=>btn.addEventListener('click',()=>{
    toggle.forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
    kind=btn.dataset.kind;
    urlField.hidden=kind!=='renovation';
    updateHref();
  }));
  urlInput.addEventListener('input',updateHref);
  submit.addEventListener('click',()=>{
    if(location.hostname==='aidealize.com'){window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:'portfolio_contact_submit',portfolio_name:'yui',inquiry_type:kind,page_path:location.pathname})}
  });
  updateHref();
})();
