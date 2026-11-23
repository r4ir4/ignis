"""Fill a LOCAL Ignis API with made-up data so the site can be tried out with something on every page.

Usage (the API must be running on this machine, with its own throwaway database):
    IGNIS_WEB_SECRET=<the secret that API was started with> python3 dev_seed.py [http://127.0.0.1:8012]

It only talks to localhost and refuses anything else, so it can never write to the live site. Everything it creates is invented.
Run it once on an empty test database; running it again adds a second set.
"""
import json
import os
import random
import sys
import urllib.request
from datetime import date, timedelta
from urllib.parse import urlparse

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8012").rstrip("/")
if urlparse(BASE).hostname not in ("127.0.0.1", "localhost", "::1"):
    sys.exit("dev_seed.py only writes to a local API (127.0.0.1 or localhost), never to the live site.")
SECRET = os.environ.get("IGNIS_WEB_SECRET", "localtestsecret")
random.seed(7)
TODAY = date.today()


def day(offset: int = 0) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def call(method: str, path: str, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"x-ignis-web-secret": SECRET, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except Exception as e:  # keep going: one failing page should not stop the rest
        detail = getattr(e, "read", lambda: b"")().decode()[:200]
        print("  ! " + method + " " + path + " -> " + str(e) + " " + detail)
        return None


def section(name: str) -> None:
    print("•", name)


# ---- diary ----------------------------------------------------------------------------------------------------------------------------------
section("diary")
notes = [
    "Acordei cedo e caminhei 30 minutos antes do trabalho. Me senti bem o dia todo.",
    "Dia pesado no trabalho, mas consegui fechar a entrega. #pesquisar mais sobre ativação comportamental",
    "Jantar com a família. Conversa boa, dormi tarde.",
    "Treino de perna forte. Dolorida mas feliz.",
    "Não rendi muito de manhã. À tarde melhorou depois do café e de uma pausa.",
    "Terminei um capítulo do livro e anotei duas ideias boas.",
    "Dia de descanso. Cozinhei, arrumei a casa e vi um filme.",
    "Reunião longa. Preciso lembrar de proteger meu tempo de foco. #pesquisar técnicas de foco",
]
for i, t in enumerate(notes):
    call("POST", "/v1/entries", {"text": t, "created_at": (TODAY - timedelta(days=i * 2 + 1)).isoformat() + "T21:15:00Z"})

# ---- todos ----------------------------------------------------------------------------------------------------------------------------------
section("todos")
for title, cat, off in [("Pagar condomínio", "casa", 0), ("Marcar dentista", "saúde", 0), ("Responder e-mails", "trabalho", 0), ("Comprar presente", "pessoal", 1),
                        ("Revisar relatório", "trabalho", 1), ("Lavar o carro", "casa", 2), ("Ligar para a vovó", "pessoal", -1), ("Renovar documento", "pessoal", -2)]:
    t = call("POST", "/v1/todos", {"title": title, "category": cat, "day": day(off)})
    if t and off < 0:
        call("PATCH", "/v1/todos/" + t["id"], {"done_day": day(off)})

# ---- habits ---------------------------------------------------------------------------------------------------------------------------------
section("habits")
for name, sec, kind, unit, tgt in [("Beber água", "Manhã", "count", "copos", 8), ("Meditar", "Manhã", "time", "min", 10), ("Ler", "Noite", "check", "", 1),
                                   ("Caminhar", "Dia", "count", "mil passos", 8), ("Alongar", "Noite", "check", "", 1)]:
    h = call("POST", "/v1/habits", {"name": name, "section": sec, "kind": kind, "unit": unit, "target_count": tgt})
    if not h:
        continue
    for d in range(0, 21):
        if random.random() < 0.75:
            n = 1 if kind == "check" else max(1, round(tgt * random.uniform(0.5, 1.1)))
            call("PUT", "/v1/habits/" + h["id"] + "/days/" + day(-d), {"count": n})

# ---- goals ----------------------------------------------------------------------------------------------------------------------------------
section("goals")
call("POST", "/v1/goals", {"title": "Correr 5 km sem parar", "category": "body", "kind": "number", "unit": "km", "target": 5, "current": 3.2, "due": day(60)})
call("POST", "/v1/goals", {"title": "Terminar 12 livros no ano", "category": "mind", "kind": "number", "unit": "livros", "target": 12, "current": 7, "due": day(40)})
call("POST", "/v1/goals", {"title": "Montar reserva de emergência", "category": "money", "kind": "simple", "note": "Seis meses de gastos"})
call("POST", "/v1/goals", {"title": "Aprender o básico de violão", "category": "skills", "kind": "steps", "steps": [{"text": "Comprar o violão"}, {"text": "Aprender 4 acordes"}, {"text": "Tocar uma música inteira"}]})

# ---- food -----------------------------------------------------------------------------------------------------------------------------------
section("food")
call("PUT", "/v1/food/goals", {"calories": 2100, "protein_g": 110, "carbs_g": 230, "fat_g": 70, "fiber_g": 28})
call("POST", "/v1/food/presets", {"name": "Pão de forma", "calories": 249, "protein_g": 8.7, "carbs_g": 49, "fat_g": 3.1, "fiber_g": 5.2, "base_g": 100,
                                  "units": [{"name": "fatia", "grams": 25}], "default_unit": "fatia"})
call("POST", "/v1/food/presets", {"name": "Aveia em flocos", "calories": 370, "protein_g": 13, "carbs_g": 60, "fat_g": 7, "fiber_g": 10, "base_g": 100})
call("POST", "/v1/food/presets", {"name": "Banana prata", "calories": 98, "protein_g": 1.3, "carbs_g": 26, "fat_g": 0.1, "fiber_g": 2, "base_g": 100,
                                  "units": [{"name": "unidade", "grams": 80}], "default_unit": "unidade"})
meals = [("breakfast", "Pão com ovo", 320, 17, 36, 11, 3), ("am_snack", "Banana com aveia", 190, 5, 36, 3, 4), ("lunch", "Arroz, feijão e frango", 640, 42, 78, 14, 11),
         ("pm_snack", "Iogurte com frutas", 170, 8, 24, 4, 2), ("dinner", "Omelete com salada", 420, 28, 12, 28, 5)]
for d in range(0, 10):
    for slot, name, kcal, p, c, f, fi in meals:
        if random.random() < 0.85:
            k = random.uniform(0.85, 1.15)
            call("POST", "/v1/food/meals", {"day": day(-d), "slot": slot, "name": name, "calories": round(kcal * k), "protein_g": round(p * k, 1),
                                            "carbs_g": round(c * k, 1), "fat_g": round(f * k, 1), "fiber_g": round(fi * k, 1)})

# ---- metrics --------------------------------------------------------------------------------------------------------------------------------
section("metrics")
call("PUT", "/v1/metrics/goals/weight", {"value": 64})
for i, d in enumerate(range(0, 60, 4)):
    call("PUT", "/v1/metrics/entries/" + day(-d), {"values": {"weight": round(68 - (59 - d) * 0.03 + random.uniform(-0.3, 0.3), 1), "waist": round(79 - (59 - d) * 0.04, 1),
                                                              "body_fat": round(24 - (59 - d) * 0.02, 1)}})

# ---- lists ----------------------------------------------------------------------------------------------------------------------------------
section("lists")
call("POST", "/v1/lists", {"title": "Ideias para a viagem", "note": "Rascunho, nada decidido ainda",
                           "items": ["Ver passagens em março", "Pesquisar [hospedagens](https://example.com/hospedagens) perto do centro", "Fazer uma trilha", "Provar a comida local"]})
call("POST", "/v1/lists", {"title": "Parar de comer açúcar", "items": ["Sem refrigerante", "Ler o rótulo dos produtos", "Trocar a sobremesa por fruta"]})
call("POST", "/v1/lists", {"title": "Filmes para ver", "items": ["Cidade de Deus", "Parasita", "Her", "Ainda Estou Aqui"]})

# ---- books ----------------------------------------------------------------------------------------------------------------------------------
section("books")
for title, author, pages, status, cur, rating in [("Hábitos Atômicos", "James Clear", 320, "reading", 140, None), ("Sapiens", "Yuval Noah Harari", 464, "finished", 464, 5),
                                                  ("O Alquimista", "Paulo Coelho", 208, "finished", 208, 4), ("Deep Work", "Cal Newport", 304, "to_read", 0, None),
                                                  ("Dom Casmurro", "Machado de Assis", 256, "dropped", 60, 2)]:
    b = call("POST", "/v1/books", {"title": title, "author": author, "pages": pages, "status": status, "current_page": cur, "rating": rating})
    if b and status == "reading":
        for d in range(0, 6):
            call("POST", "/v1/books/" + b["id"] + "/log", {"day": day(-d), "pages": random.randint(10, 35)})

# ---- bills, subscriptions, wishlist ---------------------------------------------------------------------------------------------------------
section("bills")
for name, due, cents in [("Aluguel", 5, 220000), ("Internet", 12, 11990), ("Energia", 18, 18450), ("Água", 20, 7200)]:
    b = call("POST", "/v1/bills", {"name": name, "due_day": due, "amount_cents": cents})
    if b:
        call("PUT", "/v1/bills/" + b["id"] + "/months/" + TODAY.strftime("%Y-%m"), {"paid": due < TODAY.day, "amount_cents": cents})

section("subscriptions")
card = call("POST", "/v1/subscriptions/cards", {"name": "Cartão principal", "last4": "4242"})
for name, amount, cycle, cat, off in [("Streaming de filmes", 39.9, "monthly", "entertainment", 6), ("Música", 21.9, "monthly", "entertainment", 11),
                                      ("Armazenamento na nuvem", 9.9, "monthly", "software", 3), ("Academia", 119.0, "monthly", "health", 15), ("Domínio do site", 80.0, "yearly", "software", 120)]:
    call("POST", "/v1/subscriptions", {"name": name, "amount": amount, "cycle": cycle, "category": cat, "next_date": day(off), "card_id": (card or {}).get("id")})

section("wishlist")
for title, price, longing, cat in [("Fones de ouvido", 599.0, 4, "tech"), ("Tênis de corrida", 449.9, 5, "esporte"), ("Cadeira ergonômica", 1290.0, 3, "casa"), ("Livro de receitas", 89.9, 2, "livros")]:
    call("POST", "/v1/wishlist", {"title": title, "price": price, "currency": "BRL", "longing": longing, "category": cat, "url": "https://example.com/" + title.lower().replace(" ", "-")})

# ---- trips, cleaning ------------------------------------------------------------------------------------------------------------------------
section("trips")
t = call("POST", "/v1/trips", {"name": "Fim de semana na serra", "destination": "Campos do Jordão", "start_date": day(25), "end_date": day(28), "note": "Levar casaco"})
if t:
    for off, time, text in [(25, "09:00", "Saída de casa"), (25, "13:00", "Almoço na chegada"), (26, "10:00", "Trilha leve"), (27, "16:00", "Café colonial")]:
        call("POST", "/v1/trips/" + t["id"] + "/items", {"day": day(off), "time": time, "text": text})
    call("POST", "/v1/trips/" + t["id"] + "/places", {"name": "Mirante", "address": "Estrada do Mirante, 100", "note": "Ir no fim da tarde"})

section("cleaning")
for name, area, kind, extra in [("Lavar a louça", "Cozinha", "daily", {}), ("Aspirar a casa", "Sala", "weekly", {"weekdays": [5]}), ("Trocar a roupa de cama", "Quarto", "weekly", {"weekdays": [6]}),
                                ("Limpar a geladeira", "Cozinha", "monthly", {"month_days": [1]})]:
    task = call("POST", "/v1/cleaning/tasks", {"name": name, "area": area, "kind": kind, **extra})
    if task and kind == "daily":
        for d in range(1, 6):
            call("PUT", "/v1/cleaning/tasks/" + task["id"] + "/days/" + day(-d), {"done": True})

# ---- brain, backpack -------------------------------------------------------------------------------------------------------------------------
section("brain")
caps = [("França", "Paris"), ("Itália", "Roma"), ("Espanha", "Madri"), ("Alemanha", "Berlim"), ("Portugal", "Lisboa"), ("Grécia", "Atenas"), ("Polônia", "Varsóvia"), ("Áustria", "Viena")]
call("POST", "/v1/brain?day=" + day(), {"title": "Capitais da Europa", "note": "Para a viagem", "cards": [{"front": "Capital da " + a, "back": b} for a, b in caps]})
verbs = [("go", "went / gone"), ("see", "saw / seen"), ("take", "took / taken"), ("write", "wrote / written"), ("eat", "ate / eaten"), ("begin", "began / begun")]
call("POST", "/v1/brain?day=" + day(), {"title": "Inglês: verbos irregulares", "cards": [{"front": "Passado e particípio de " + a, "back": b} for a, b in verbs]})

section("backpack")
for name, grp, unit, qty, ago, use, every, per, reorder in [("Canetas de Mounjaro", "Saúde", "canetas", 5, 22, 1, 1, "week", 1), ("Café em grãos", "Casa", "pacotes", 3, 20, 1, 2, "week", 1),
                                                          ("Lâminas de barbear", "Casa", "lâminas", 4, 15, 1, 1, "month", 1), ("Filtro de água", "Casa", "filtro", 1, 100, 1, 6, "month", 1)]:
    call("POST", "/v1/backpack", {"name": name, "group": grp, "unit": unit, "quantity": qty, "day": day(-ago), "use_qty": use, "use_every": every, "use_period": per, "reorder_at": reorder})

print("done: open the local site and look around.")
