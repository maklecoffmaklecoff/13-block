// js/router.js
export function parseHash(){
  const raw = (location.hash || "#home").slice(1);
  const [routePart, queryPart] = raw.split("?");
  const route = routePart || "home";

  const params = new URLSearchParams(queryPart || "");
  const q = {};
  for (const [k,v] of params.entries()) q[k] = v;

  return { route, q };
}

export function go(route, q = {}){
  const params = new URLSearchParams(q);
  const suffix = [...params.keys()].length ? `?${params.toString()}` : "";
  location.hash = `#${route}${suffix}`;
}
