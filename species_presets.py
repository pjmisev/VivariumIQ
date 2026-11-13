"""Curated exotic-pet husbandry presets used for enclosure target ranges.

Each preset describes the recommended ambient temperature (Celsius), relative
humidity (%) and atmospheric pressure (hPa) band for a species. Values are
realistic starting points for hobbyist enclosures rather than veterinary
advice.
"""

PRESSURE_MIN = 990
PRESSURE_MAX = 1030


def _preset(
    key: str,
    name: str,
    group: str,
    temperature_min: float,
    temperature_max: float,
    humidity_min: float,
    humidity_max: float,
) -> dict:
    return {
        "key": key,
        "name": name,
        "group": group,
        "temperature_min": temperature_min,
        "temperature_max": temperature_max,
        "humidity_min": humidity_min,
        "humidity_max": humidity_max,
        "pressure_min": PRESSURE_MIN,
        "pressure_max": PRESSURE_MAX,
    }


# Ordered by group: presets are listed in the order the groups should appear.
SPECIES_PRESETS: list[dict] = [
    # ---------- Desert reptiles ----------
    _preset("bearded_dragon", "Bearded Dragon", "Desert reptiles", 28, 38, 30, 50),
    _preset("leopard_gecko", "Leopard Gecko", "Desert reptiles", 28, 32, 30, 40),
    _preset("uromastyx", "Uromastyx", "Desert reptiles", 30, 40, 20, 40),
    _preset("ackie_monitor", "Ackie Monitor", "Desert reptiles", 28, 38, 40, 60),
    _preset("savannah_monitor", "Savannah Monitor", "Desert reptiles", 26, 38, 40, 60),
    _preset("frilled_dragon", "Frilled Dragon", "Desert reptiles", 26, 32, 50, 70),
    _preset("chuckwalla", "Chuckwalla", "Desert reptiles", 30, 38, 20, 40),
    _preset("collared_lizard", "Collared Lizard", "Desert reptiles", 28, 35, 30, 50),
    _preset("sulcata_tortoise", "Sulcata Tortoise", "Desert reptiles", 27, 35, 30, 50),
    _preset("leopard_tortoise", "Leopard Tortoise", "Desert reptiles", 26, 34, 40, 60),

    # ---------- Tropical reptiles ----------
    _preset("red_footed_tortoise", "Red-Footed Tortoise", "Tropical reptiles", 26, 30, 70, 85),
    _preset("veiled_chameleon", "Veiled Chameleon", "Tropical reptiles", 24, 30, 50, 70),
    _preset("panther_chameleon", "Panther Chameleon", "Tropical reptiles", 22, 28, 60, 80),
    _preset("green_iguana", "Green Iguana", "Tropical reptiles", 26, 32, 60, 80),
    _preset("water_dragon", "Water Dragon", "Tropical reptiles", 26, 32, 60, 80),
    _preset("tokay_gecko", "Tokay Gecko", "Tropical reptiles", 24, 30, 60, 80),
    _preset("crocodile_skink", "Crocodile Skink", "Tropical reptiles", 24, 28, 70, 85),

    # ---------- Temperate reptiles ----------
    _preset("blue_tongue_skink", "Blue-Tongue Skink", "Temperate reptiles", 22, 28, 40, 60),
    _preset("hermanns_tortoise", "Hermann's Tortoise", "Temperate reptiles", 22, 28, 40, 60),
    _preset("russian_tortoise", "Russian Tortoise", "Temperate reptiles", 22, 28, 30, 50),
    _preset("slow_worm", "Slow Worm", "Temperate reptiles", 15, 22, 50, 70),
    _preset("musk_turtle", "Common Musk Turtle", "Temperate reptiles", 20, 26, 50, 70),

    # ---------- Snakes ----------
    _preset("ball_python", "Ball Python", "Snakes", 26, 32, 50, 60),
    _preset("corn_snake", "Corn Snake", "Snakes", 24, 30, 40, 60),
    _preset("milk_snake", "Milk Snake", "Snakes", 24, 30, 40, 60),
    _preset("kingsnake", "Kingsnake", "Snakes", 24, 30, 40, 60),
    _preset("boa_constrictor", "Boa Constrictor", "Snakes", 26, 32, 50, 70),
    _preset("hognose_snake", "Hognose Snake", "Snakes", 25, 30, 30, 50),
    _preset("garter_snake", "Garter Snake", "Snakes", 20, 26, 50, 70),
    _preset("carpet_python", "Carpet Python", "Snakes", 26, 32, 50, 70),

    # ---------- Arboreal geckos ----------
    _preset("crested_gecko", "Crested Gecko", "Arboreal geckos", 20, 25, 60, 80),
    _preset("gargoyle_gecko", "Gargoyle Gecko", "Arboreal geckos", 20, 26, 60, 80),
    _preset("day_gecko", "Day Gecko", "Arboreal geckos", 24, 30, 50, 70),
    _preset("mourning_gecko", "Mourning Gecko", "Arboreal geckos", 22, 28, 50, 70),
    _preset("giant_day_gecko", "Giant Day Gecko", "Arboreal geckos", 24, 30, 50, 70),

    # ---------- Amphibians ----------
    _preset("pacman_frog", "Pac-Man Frog", "Amphibians", 24, 28, 70, 85),
    _preset("whites_tree_frog", "White's Tree Frog", "Amphibians", 22, 26, 60, 80),
    _preset("dart_frog", "Dart Frog", "Amphibians", 22, 26, 80, 100),
    _preset("axolotl", "Axolotl", "Amphibians", 16, 20, 50, 70),
    _preset("fire_bellied_toad", "Fire-Bellied Toad", "Amphibians", 20, 26, 50, 70),
    _preset("tiger_salamander", "Tiger Salamander", "Amphibians", 15, 22, 60, 80),
    _preset("red_eyed_tree_frog", "Red-Eyed Tree Frog", "Amphibians", 22, 28, 70, 90),

    # ---------- Invertebrates ----------
    _preset("emperor_scorpion", "Emperor Scorpion", "Invertebrates", 24, 30, 60, 80),
    _preset("chilean_rose_tarantula", "Chilean Rose Tarantula", "Invertebrates", 22, 28, 50, 70),
    _preset("mexican_red_knee", "Mexican Red Knee", "Invertebrates", 24, 28, 60, 75),
    _preset("goliath_birdeater", "Goliath Birdeater", "Invertebrates", 24, 28, 70, 85),
    _preset("giant_african_millipede", "Giant African Millipede", "Invertebrates", 22, 28, 70, 85),
    _preset("madagascar_hissing_cockroach", "Madagascar Hissing Cockroach", "Invertebrates", 24, 30, 60, 80),
    _preset("orchid_mantis", "Orchid Mantis", "Invertebrates", 22, 28, 60, 80),
    _preset("ghost_mantis", "Ghost Mantis", "Invertebrates", 24, 30, 50, 70),
    _preset("hermit_crab", "Hermit Crab", "Invertebrates", 24, 28, 70, 85),

    # ---------- Exotic mammals ----------
    _preset("african_pygmy_hedgehog", "African Pygmy Hedgehog", "Exotic mammals", 24, 29, 30, 50),
    _preset("sugar_glider", "Sugar Glider", "Exotic mammals", 24, 28, 50, 70),
    _preset("chinchilla", "Chinchilla", "Exotic mammals", 15, 21, 30, 50),
    _preset("ferret", "Ferret", "Exotic mammals", 15, 24, 40, 60),
]


PRESETS_BY_KEY: dict[str, dict] = {preset["key"]: preset for preset in SPECIES_PRESETS}


def get_preset_groups() -> list[dict]:
    """Return presets grouped by species group, ordered by first appearance."""

    groups: dict[str, list[dict]] = {}
    for preset in SPECIES_PRESETS:
        groups.setdefault(preset["group"], []).append(preset)
    return [{"name": name, "presets": presets} for name, presets in groups.items()]
