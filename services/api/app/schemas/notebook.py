import json
import re
from uuid import UUID
from urllib.parse import urlsplit
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_serializer, StrictInt, StrictStr, StrictFloat, StrictBool

PAGE_ICON_IDS = ('flame', 'calendar', 'home', 'book', 'leaf', 'star', 'moon', 'sun', 'heart', 'coffee', 'sparkles', 'flower', 'grid', 'check', 'checklist', 'clipboard', 'folder', 'archive', 'file', 'pen', 'tag', 'bookmark', 'clock', 'bell', 'target', 'flag', 'compass', 'globe', 'map', 'mountain', 'tree', 'sprout', 'cloud', 'briefcase', 'laptop', 'code', 'terminal', 'line-chart', 'bar-chart', 'layers', 'mail', 'message', 'user', 'users', 'shield', 'lock', 'key', 'camera', 'image', 'music', 'headphones', 'play', 'microphone', 'gift', 'rocket', 'lightbulb', 'trophy', 'utensils', 'shopping-bag', 'wallet', 'palette', 'wrench', 'pin', 'link', 'graduation', 'beaker', 'dumbbell', 'brain', 'bed', 'anchor', 'building', 'plane', 'puzzle', 'settings', 'planet', 'orbit', 'satellite', 'telescope', 'ufo', 'astronaut', 'comet', 'constellation', 'galaxy', 'eclipse', 'moon-stars', 'stars', 'atom', 'meteor', 'fire', 'campfire', 'torch', 'candle', 'volcano', 'lightning', 'head', 'thought', 'neurons', 'brain-circuit', 'eye', 'meditation', 'infinity', 'wave', 'crystal', 'diamond')
PAGE_ICON_IDS += ('notion-123-a665a', 'notion-vitruvian-man-circle-841d9', 'notion-activity-rectangle-e495a', 'notion-plus-circle-f4a8b', 'notion-airplane-0f488', 'notion-alarm-clock-26869', 'notion-exclamation-speech-bubble-2c31b', 'notion-alien-a49c1', 'notion-alien-pixel-17665', 'notion-ambulance-efdfc', 'notion-anchor-79bfb', 'notion-apple-3a7bd', 'notion-apron-e79e8', 'notion-aquarius-3046f', 'notion-bridge-arch-f636b', 'notion-bow-arrow-bc918', 'notion-archive-box-d468d', 'notion-aries-d66a9', 'notion-airplane-arrival-4ada5', 'notion-arrow-circle-down-9f1db', 'notion-arrow-down-circle-f87b1', 'notion-arrow-down-f8e2e', 'notion-arrow-down-line-89a6a', 'notion-arrow-left-circle-5c139', 'notion-arrow-left-ae97a', 'notion-arrow-left-line-c867f', 'notion-arrow-northeast-0a498', 'notion-arrow-northwest-340b3', 'notion-arrow-right-circle-35320', 'notion-arrow-right-c451f', 'notion-arrow-right-line-aeba2', 'notion-arrow-southeast-ba2b5', 'notion-arrow-southwest-f5f73', 'notion-arrow-turn-left-237c9', 'notion-arrow-turn-right-6423c', 'notion-arrow-up-circle-7eb1b', 'notion-arrow-up-d77ac', 'notion-arrow-up-line-e4ada', 'notion-arrows-horizontal-1db8d', 'notion-arrows-swap-horizontal-da75e', 'notion-arrows-swap-vertical-8461e', 'notion-arrows-vertical-b81f4', 'notion-artwork-frame-e7165', 'notion-asterisk-e88b5', 'notion-cash-machine-010fc', 'notion-paperclip-670d4', 'notion-avocado-f9c9b', 'notion-baby-a3ca3', 'notion-baby-bottle-38776', 'notion-backpack-5f003', 'notion-arrow-left-heavy-87980', 'notion-identification-badge-e4647', 'notion-intravenous-bag-89ee2', 'notion-baggage-claim-ae978', 'notion-balloon-00477', 'notion-bananas-e4ba5', 'notion-barcode-90c15', 'notion-traffic-barricade-d12f4', 'notion-baseball-a01ed', 'notion-baseball-cap-66cae', 'notion-basketball-f02c9', 'notion-bathtub-82157', 'notion-bathtub-shower-79ea8', 'notion-battery-f3d17', 'notion-battery-electrical-plug-62d98', 'notion-battery-lightning-bolt-6ad38', 'notion-bed-c5052', 'notion-bee-62cb8', 'notion-beer-glass-93ce8', 'notion-beer-bottle-8a614', 'notion-bell-f6837', 'notion-bell-notification-d7eaf', 'notion-bell-slash-69635', 'notion-belt-5f4f0', 'notion-bicycle-d29af', 'notion-bikini-d937a', 'notion-binoculars-a0e23', 'notion-blood-pressure-monitor-de3ef', 'notion-bluetooth-a828d', 'notion-ticket-airplane-58fb5', 'notion-ferry-boat-95189', 'notion-bomb-eb0af', 'notion-bone-c8dac', 'notion-book-open-d4985', 'notion-book-closed-c2135', 'notion-bookmark-ffe7f', 'notion-bookmark-outline-8cf7c', 'notion-boombox-43f3f', 'notion-boot-4509b', 'notion-arrow-bounce-heavy-32b79', 'notion-bowl-d9f2b', 'notion-bowl-food-08646', 'notion-bowling-ball-pins-d5e1d', 'notion-bra-8f684', 'notion-human-profile-brain-fdbb5', 'notion-arrows-branch-5bb99', 'notion-branch-f38c7', 'notion-branch-fork-6539f', 'notion-branch-merge-de2a6', 'notion-bread-98560', 'notion-briefcase-64527', 'notion-brightness-aa6ed', 'notion-broccoli-067d8', 'notion-broom-100a0', 'notion-broom-dustpan-8fc59', 'notion-x-octagon-cbb44', 'notion-bug-ecb53', 'notion-bugle-93890', 'notion-target-arrow-185da', 'notion-bunk-bed-38ea0', 'notion-burger-3ed1f', 'notion-burst-57d59', 'notion-bus-04e02', 'notion-bus-double-decker-22c0f', 'notion-bus-metro-c6e3a', 'notion-butterfly-fcfd0', 'notion-pin-back-button-edf76', 'notion-cactus-caaea', 'notion-coffee-cup-799f9', 'notion-cake-32cdb', 'notion-calculator-d2d4a', 'notion-calendar-51527', 'notion-day-calendar-17986', 'notion-month-calendar-670a6', 'notion-week-calendar-3a930', 'notion-camera-89e8b', 'notion-camera-slash-0b39e', 'notion-rectangles-landscape-65c34', 'notion-rectangles-portrait-4e5f4', 'notion-camping-tent-f2e37', 'notion-camping-trailer-07e4b', 'notion-cancer-5600a', 'notion-candy-4d160', 'notion-capricorn-a138f', 'notion-car-2b296', 'notion-identification-card-09fc6', 'notion-playing-card-club-8b6b1', 'notion-playing-card-diamond-aea5d', 'notion-playing-card-heart-a41a1', 'notion-playing-card-spade-40f4b', 'notion-playing-cards-b270e', 'notion-carrot-b9648', 'notion-currency-cash-23c16', 'notion-cash-register-1f9e8', 'notion-fire-dc9f2', 'notion-fire-extinguisher-824d6', 'notion-fire-truck-6b213', 'notion-fireworks-0caee', 'notion-temperature-hot-0cf0c', 'notion-tulip-name-tag-7f460', 'notion-tree-conifer-fire-ebfc8', 'notion-brick-wall-95b65', 'notion-rocket-c58dd', 'notion-telescope-918d6', 'notion-star-525ec', 'notion-star-half-94d06', 'notion-star-outline-d4a45', 'notion-sun-27756', 'notion-star-circle-aad4c', 'notion-face-gasp-6af39', 'notion-playback-play-ea025', 'notion-playback-play-button-e4596', 'notion-asterisk-heavy-31142', 'notion-sparkle-aefe4', 'notion-heart-3cb96', 'notion-heart-box-bow-33cea', 'notion-heart-outline-10e18', 'notion-heart-rate-2e060', 'notion-heart-rate-rectangle-27f9f', 'notion-heart-lightning-bolt-e364e', 'notion-heart-broken-30a25', 'notion-stethoscope-593fe', 'notion-face-heart-eyes-aba6a', 'notion-playing-card-suit-heart-35584', 'notion-moon-9e78b', 'notion-orbit-4fa1a', 'notion-weather-cloud-moon-f085f', 'notion-ringed-planet-37c85', 'notion-music-note-8th-beamed-53c34', 'notion-music-album-34bc7', 'notion-tape-cassette-fd218', 'notion-mirror-ball-02862', 'notion-headphones-86d6e', 'notion-metronome-9e03f', 'notion-music-note-8th-2ea58', 'notion-music-note-half-8ba9c', 'notion-music-note-quarter-32161', 'notion-music-note-16th-2902f', 'notion-music-note-16th-beamed-50a04', 'notion-music-note-whole-cbb3f', 'notion-music-note-list-25846', 'notion-radio-aa3a0', 'notion-vinyl-record-9f586', 'notion-clarinet-bf8c1', 'notion-guitar-electric-e3dc0', 'notion-guitar-acoustic-1a669', 'notion-piano-1d78e', 'notion-snare-drum-98412', 'notion-trumpet-b7dfa', 'notion-violin-00e3e', 'notion-computer-aa973', 'notion-computer-chip-812d8', 'notion-computer-window-0c50f', 'notion-robot-18d63', 'notion-tablet-computer-1bb4e', 'notion-laptop-computer-c2570', 'notion-cursor-46a4e', 'notion-cursor-button-1ae37', 'notion-cursor-click-fcffd', 'notion-flower-daisy-f5179', 'notion-hanafuda-cded0', 'notion-flower-tulip-21eca', 'notion-fleur-de-lis-92745', 'notion-gravestone-373c9', 'notion-leaf-9f911', 'notion-leaf-monstera-c349a', 'notion-tree-conifer-90ee6', 'notion-tree-palm-7038d', 'notion-tree-deciduous-b5afb', 'notion-clover-four-leaf-188cd', 'notion-donkey-d22f1', 'notion-elephant-cd08c', 'notion-fish-b474a', 'notion-rabbit-d37d9', 'notion-turtle-74dd7', 'notion-cat-77af7', 'notion-chicken-811eb', 'notion-cow-beb13', 'notion-crab-3349a', 'notion-dog-cd635', 'notion-duck-2d237', 'notion-feather-b5211', 'notion-pig-f0b8c', 'notion-sheep-5c599', 'notion-snake-538d7', 'notion-whale-a5d2a', 'notion-poultry-4fac4', 'notion-golf-625fe', 'notion-location-arrow-e3b39', 'notion-medication-87663', 'notion-location-arrow-circle-48a3e', 'notion-app-notification-8d983', 'notion-checkmark-verification-76f2c', 'notion-rectangle-stack-cdfbe', 'notion-church-badb8', 'notion-circle-square-triangle-7eb8d', 'notion-cherries-c6de7', 'notion-corn-63b04', 'notion-cupcake-b0eae', 'notion-fork-plate-e80e4', 'notion-egg-34707', 'notion-fork-spoon-knife-c2d11', 'notion-fork-8d0c7', 'notion-fork-knife-21cc3', 'notion-frying-pan-egg-73b43', 'notion-garlic-41024', 'notion-milk-carton-apple-e83a9', 'notion-knife-3d4d1', 'notion-knife-kitchen-8230d', 'notion-lemon-f464d', 'notion-meat-59d6d', 'notion-microwave-d2bed', 'notion-nut-7dfd8', 'notion-onion-28897', 'notion-orange-1b4c9', 'notion-oven-4908a', 'notion-peanut-55098', 'notion-pear-97cfb', 'notion-pizza-9ed15', 'notion-pretzel-d1fed', 'notion-refrigerator-0cf35', 'notion-sandwich-8f5c5', 'notion-seed-19b25', 'notion-shell-ce635', 'notion-soybeans-452d3', 'notion-spoon-7f480', 'notion-stomach-d5a0d', 'notion-stovetop-4bc33', 'notion-strawberry-5e737', 'notion-human-profile-throat-51b47', 'notion-grain-2c224', 'notion-plate-food-f8a52', 'notion-grapes-8286e', 'notion-capitol-building-5c67f', 'notion-hammer-3ef81', 'notion-classical-building-121bb', 'notion-school-d64de', 'notion-cityscape-4d339', 'notion-makeup-brush-7bcc5', 'notion-scrub-brush-23a2e', 'notion-screwdriver-2f2d4', 'notion-wrench-702b0', 'notion-weather-cloud-28b94', 'notion-weather-cloud-fog-93e3f', 'notion-weather-cloud-hail-c4d20', 'notion-weather-cloud-sun-fe970', 'notion-weather-cloud-rain-4c1c5', 'notion-weather-cloud-sleet-5ec7c', 'notion-snowflake-de5a1', 'notion-weather-cloud-lightning-bolt-e7a5c', 'notion-sunglasses-754ee', 'notion-temperature-cold-c7531', 'notion-umbrella-29747', 'notion-wind-9b58e', 'notion-motorcycle-48a39', 'notion-roller-skate-6f0d3', 'notion-skateboard-2406f', 'notion-passport-cbc47', 'notion-flag-checkered-9a088', 'notion-football-6382d', 'notion-ice-skate-e8ee8', 'notion-inline-skate-8891c', 'notion-person-running-d3d9d', 'notion-soccer-8f27f', 'notion-whistle-fa829', 'notion-person-feminine-4a4cd', 'notion-person-masculine-9c179', 'notion-user-speech-bubble-ca66c', 'notion-child-ddc9e', 'notion-user-2-38b59', 'notion-user-3-c4d51', 'notion-person-trash-can-1e860', 'notion-people-meeting-6f0d0', 'notion-people-c9022', 'notion-human-profile-cbd5c', 'notion-person-walking-circle-1df17', 'notion-people-counter-5ae88', 'notion-people-arms-linked-61b17', 'notion-user-squares-32f83', 'notion-user-04f89', 'notion-user-circle-outline-9e472', 'notion-user-circle-dashed-6bfcc', 'notion-user-circle-1291b', 'notion-vitruvian-man-fbc22', 'notion-person-walking-c5895', 'notion-wheelchair-ce579', 'notion-person-wheelchair-9bbe4', 'notion-wheelchair-motorized-cc162', 'notion-lightning-bolt-ba84b', 'notion-light-bulb-1bafd', 'notion-shade-light-d4961', 'notion-yin-yang-ef958', 'notion-flashlight-b982e', 'notion-traffic-light-34d73', 'notion-train-light-rail-31ab9', 'notion-jack-o-lantern-60817', 'notion-sun-arrow-up-480ea', 'notion-sunscreen-c07dc', 'notion-sun-arrow-down-e560f', 'notion-hat-sunglasses-3cbcf', 'notion-face-sunglasses-68266', 'notion-water-0f416', 'notion-drink-218ae', 'notion-house-flood-bdf03', 'notion-helm-ab14d', 'notion-highball-glass-9cd38', 'notion-pitcher-f9eb3', 'notion-shower-52815', 'notion-sink-1978b', 'notion-soda-bottle-84eae', 'notion-bridge-suspension-ee619', 'notion-teapot-33f38', 'notion-toilet-74f7f', 'notion-sailboat-72bec', 'notion-tree-christmas-9d2d7', 'notion-holiday-ornament-b4842', 'notion-mountains-5e23d', 'notion-parking-circle-481e5', 'notion-parking-circle-slash-e213e', 'notion-steering-wheel-9d504', 'notion-credit-card-c59fa', 'notion-milk-carton-c2c96', 'notion-baggage-cart-1d5ab', 'notion-postcard-22f0b', 'notion-scarf-b4a8d', 'notion-shopping-cart-4aa23', 'notion-playing-card-suit-club-7494a', 'notion-playing-card-suit-diamond-1571d', 'notion-playing-card-suit-spade-de90a', 'notion-comb-ef4e3', 'notion-fuel-acbe4', 'notion-book-school-ed78c', 'notion-hair-dryer-04210', 'notion-handbag-d5319', 'notion-luggage-f59e7', 'notion-baby-pram-56903', 'notion-stroller-c0f04', 'notion-suitcase-9817a', 'notion-phone-smart-98750', 'notion-phone-handset-8546a', 'notion-phone-handset-down-b402f', 'notion-phone-handset-waves-82efa', 'notion-headphones-microphone-336d5', 'notion-megaphone-f2a76', 'notion-microphone-d7f4d', 'notion-microphone-slash-b5013', 'notion-stage-microphone-7d8a3', 'notion-telephone-73397', 'notion-movie-camera-7c900', 'notion-video-camera-f8186', 'notion-video-camera-slash-ae493', 'notion-chart-bar-vertical-41815', 'notion-chart-bar-horizontal-2dc27', 'notion-chart-area-c32ee', 'notion-chart-donut-37246', 'notion-chart-line-711eb', 'notion-chart-bar-line-e3448', 'notion-chart-pie-bac7b', 'notion-chart-flow-ed81e', 'notion-chart-timeline-6fc3d', 'notion-spreadsheet-53e54', 'notion-check-20f65', 'notion-checkmark-list-4bccd', 'notion-checkmark-circle-ae3e1', 'notion-checkmark-fdc90', 'notion-checkmark-square-f2bf5', 'notion-cloud-checkmark-1b4e5', 'notion-user-checkmark-1db21', 'notion-shop-8d900', 'notion-shopping-bag-ac282', 'notion-shopping-basket-3fd43', 'notion-square-outline-37d7d', 'notion-flag-807d0', 'notion-flag-pennant-d493c', 'notion-flag-swallowtail-241be', 'notion-castle-913a5', 'notion-castle-japanese-012ab', 'notion-game-pawn-c52d0', 'notion-video-game-modern-5debf', 'notion-video-game-classic-c5dad', 'notion-video-game-joystick-9e6d8', 'notion-chess-bishop-9f332', 'notion-chess-king-08941', 'notion-chess-knight-7070e', 'notion-chess-pawn-a71fc', 'notion-chess-queen-04e9d', 'notion-chess-rook-7c939', 'notion-die-1-42cb3', 'notion-die-2-2c261', 'notion-die-3-45304', 'notion-die-4-e8736', 'notion-die-5-e3bd5', 'notion-die-6-4b05f', 'notion-mahjong-0792a', 'notion-shogi-7fe20', 'notion-hand-1b001', 'notion-hand-octagon-3be1e', 'notion-coffee-maker-10c57', 'notion-pump-bottle-64172', 'notion-towel-10ca5', 'notion-tray-ad9a0', 'notion-envelope-open-169de', 'notion-container-x-10f6d', 'notion-postage-stamp-8ed61', 'notion-paper-airplane-76453', 'notion-map-folded-7e892', 'notion-map-pin-acd59', 'notion-map-pin-triangle-f4426', 'notion-globe-desk-bcf02', 'notion-globe-d2a1f', 'notion-pencil-13809', 'notion-pencil-square-outline-6bb73', 'notion-pencil-list-03c6e')
PAGE_SYMBOL_PATTERN = r'^(icon:(' + '|'.join(PAGE_ICON_IDS) + r')(?::(?:default|gray|brown|yellow|orange|green|blue|purple|pink|red))?|emoji:[^\x00-\x1f\x7f]+)$'

class PageCover(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url: str = Field(max_length=2048)
    position: float = Field(default=50, ge=0, le=100, allow_inf_nan=False)
    author: str | None = Field(default=None, max_length=200)
    authorUrl: str | None = Field(default=None, max_length=2048)
    sourceUrl: str | None = Field(default=None, max_length=2048)

    @model_validator(mode='after')
    def valid_urls(self):
        for value in [self.url, self.authorUrl, self.sourceUrl]:
            if value is None:
                continue
            if value == self.url and value in {'/field-notes/meadow.webp', '/storybook/woodland-path.webp'}:
                continue
            if value == self.url and re.fullmatch(r'/api/notebook/cover-images/[a-f0-9]{64}\.webp', value):
                continue
            parsed = urlsplit(value)
            if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError('Cover images and credits require HTTPS URLs.')
        return self

ITEM_STATUS_PATTERN = r'^(To do|In progress|Done|column:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'

class BoardColumn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=60, pattern=r'^[^\x00-\x1f\x7f]+$')
    group: Literal['todo', 'in-progress', 'complete'] | None = None
    color: Literal['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

    @model_validator(mode='after')
    def nonempty_name(self):
        if not self.name.strip():
            raise ValueError('A column name is required.')
        return self

class BoardDefinition(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order: list[str] = Field(min_length=1, max_length=20)
    columns: dict[str, BoardColumn] = Field(min_length=1, max_length=20)

    @field_serializer('columns')
    def serialize_columns(self, value):
        return {key: column.model_dump(exclude_none=True) for key, column in value.items()}

    @model_validator(mode='after')
    def valid_columns(self):
        if len(set(self.order)) != len(self.order) or set(self.order) != set(self.columns) or any(not re.fullmatch(ITEM_STATUS_PATTERN, key) for key in self.order):
            raise ValueError('Board columns require unique stable IDs and matching definitions.')
        return self

class ButtonStep(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['complete', 'reopen', 'check', 'today', 'edit']
    targetProperty: str | None = Field(default=None, max_length=43)
    value: StrictStr | StrictFloat | StrictBool | None = None
    targetId: UUID | None = None

    @model_validator(mode='after')
    def valid_step(self):
        if self.targetProperty is not None and self.targetProperty not in {'title', 'status', 'date', 'value'}:
            UUID(self.targetProperty)
        if isinstance(self.value, str) and len(self.value) > 2000:
            raise ValueError('Action value is too long.')
        if isinstance(self.value, float):
            import math
            if not math.isfinite(self.value):
                raise ValueError('Action numbers must be finite.')
        return self

class PropertyConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    buttonLabel: str | None = Field(default=None, max_length=60)
    confirmation: str | None = Field(default=None, max_length=300)
    steps: list[ButtonStep] | None = Field(default=None, max_length=10)
    statusGroups: dict[str, Literal['todo', 'in-progress', 'complete']] | None = Field(default=None, max_length=30)
    defaultStatus: str | None = Field(default=None, min_length=1, max_length=60)
    optionColors: dict[str, Literal['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']] | None = Field(default=None, max_length=30)
    optionSort: Literal['manual', 'ascending', 'descending'] | None = None
    expression: str | None = Field(default=None, max_length=1000)
    targetListId: UUID | None = None
    relationId: UUID | None = None
    targetProperty: str | None = Field(default=None, max_length=43)
    aggregation: Literal['count', 'sum', 'average', 'min', 'max', 'unique'] | None = None
    action: Literal['complete', 'reopen', 'check'] | None = None
    targetId: UUID | None = None
    prefix: str | None = Field(default=None, max_length=12, pattern=r'^[A-Za-z0-9_-]*$')

    @model_validator(mode='after')
    def valid_target(self):
        if self.targetProperty is not None and self.targetProperty not in {'title', 'value', 'status', 'date'}:
            UUID(self.targetProperty)
        return self

class ItemMetadata(BaseModel):
    number: int | None = Field(default=None, ge=1, le=1_000_000_000_000, strict=True)
    model_config = ConfigDict(extra='forbid')
    createdAt: str | None = None
    createdBy: str | None = Field(default=None, max_length=120)
    editedAt: str | None = None
    editedBy: str | None = Field(default=None, max_length=120)

    @model_validator(mode='after')
    def valid_times(self):
        from datetime import datetime
        for value in (self.createdAt, self.editedAt):
            if value is not None:
                if not re.match(r'\d{4}-\d{2}-\d{2}T', value):
                    raise ValueError('Use an ISO timestamp.')
                datetime.fromisoformat(value.replace('Z', '+00:00'))
        return self

class TaskProperty(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    name: str = Field(min_length=1, max_length=60, pattern=r'^[^\x00-\x1f\x7f]+$')
    type: Literal['text', 'number', 'select', 'multi-select', 'status', 'date', 'person', 'files', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created-time', 'created-by', 'edited-time', 'edited-by', 'button', 'place', 'id']
    options: list[str] = Field(default_factory=list, max_length=30)
    config: PropertyConfig | None = None

    @field_serializer('config')
    def serialize_config(self, value):
        return value.model_dump(mode='json', exclude_none=True) if value else None

    @model_validator(mode='after')
    def valid_definition(self):
        if not self.name.strip() or len(set(self.options)) != len(self.options) or any(not option.strip() or len(option) > 60 or re.search(r'[\x00-\x1f\x7f]', option) for option in self.options):
            raise ValueError('Invalid property name or options.')
        if self.config and ((self.config.statusGroups is not None and (self.type != 'status' or any(key not in self.options for key in self.config.statusGroups))) or (self.config.defaultStatus is not None and (self.type != 'status' or self.config.defaultStatus not in self.options))):
            raise ValueError('Status groups and defaults must refer to options in a Status property.')
        if self.config and self.config.optionColors and any(key not in self.options for key in self.config.optionColors):
            raise ValueError('Option colors must refer to existing options.')
        if self.options and self.type not in {'select', 'multi-select', 'status', 'person'}:
            raise ValueError('Only selection properties may define options.')
        return self


def valid_property_value(value, definition):
    if value is None:
        return True
    kind = definition.type
    if kind in {'text', 'place'}:
        return isinstance(value, str) and len(value) <= 2000
    if kind == 'number':
        return type(value) in (int, float) and __import__('math').isfinite(value) and abs(value) <= 1e12
    if kind == 'checkbox':
        return type(value) is bool
    if kind == 'date':
        from datetime import date
        try:
            return isinstance(value, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value)) and date.fromisoformat(value).isoformat() == value
        except ValueError:
            return False
    if kind == 'url':
        if not isinstance(value, str) or len(value) > 2000:
            return False
        try:
            parsed = urlsplit(value)
            return parsed.scheme in {'http', 'https'} and bool(parsed.hostname) and not parsed.username and not parsed.password
        except ValueError:
            return False
    if kind == 'email':
        return isinstance(value, str) and len(value) <= 254 and bool(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value))
    if kind == 'phone':
        return isinstance(value, str) and len(value) <= 60 and bool(re.fullmatch(r'[+0-9() .#x-]+', value)) and bool(re.search(r'[0-9]', value))
    if kind == 'files':
        from types import SimpleNamespace
        return isinstance(value, list) and len(value) <= 30 and all(isinstance(v, str) and (valid_property_value(v, SimpleNamespace(type='url')) or bool(re.fullmatch(r'/api/notebook/attachments/[a-f0-9]{64}/[A-Za-z0-9_.%-]+', v))) for v in value)
    if kind == 'relation':
        if not isinstance(value, list) or len(value) > 30 or not all(isinstance(v, str) for v in value) or len(set(value)) != len(value):
            return False
        try:
            return all(str(UUID(v)) == v.lower() for v in value)
        except ValueError:
            return False
    if kind in {'created-time', 'created-by', 'edited-time', 'edited-by', 'formula', 'rollup', 'button', 'id'}:
        return False
    if kind in {'select', 'status'}:
        return isinstance(value, str) and value in definition.options
    return isinstance(value, list) and len(value) <= 30 and all(isinstance(v, str) and v in definition.options for v in value) and len(set(value)) == len(value)

class PersonalItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    title: str = Field(max_length=500)
    status: str = Field(max_length=43, pattern=ITEM_STATUS_PATTERN)
    date: str | None = None
    value: float | None = Field(default=None, ge=0, le=1e12, allow_inf_nan=False, strict=True)
    description: str = Field(default='', max_length=5000)
    descriptionContent: dict[str, Any] | None = Field(default=None, description='Rich task body as a Tiptap document. Plain description remains a searchable text summary.')
    cover: str | None = Field(default=None, max_length=2000)
    metadata: ItemMetadata | None = None
    properties: dict[str, StrictStr | StrictFloat | StrictBool | list[StrictStr] | None] | None = Field(default=None, max_length=30)

    @model_validator(mode='after')
    def valid_values(self):
        if self.descriptionContent is not None:
            NotebookPage(id=self.id, title='', content=self.descriptionContent)
        if self.date is not None:
            from datetime import date
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', self.date):
                raise ValueError('Invalid item date.')
            date.fromisoformat(self.date)
        if self.cover is not None and not (self.cover.startswith('https://') or re.fullmatch(r'/api/notebook/cover-images/[a-f0-9]{64}\.(webp|png|jpg)', self.cover)):
            raise ValueError('Unsupported item image URL.')
        return self

class NumberDisplay(BaseModel):
    model_config = ConfigDict(extra='forbid')
    showAs: Literal['number', 'bar', 'ring']
    color: Literal['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
    divideBy: float = Field(gt=0, le=1e12, allow_inf_nan=False, strict=True)
    showNumber: StrictBool

class PropertyDisplay(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=1, max_length=60, pattern=r'^[^\x00-\x1f\x7f]+$')
    visibility: Literal['always', 'empty', 'hidden'] = 'always'
    number: NumberDisplay | None = None
    order: int | None = Field(default=None, ge=0, lt=34, strict=True)

class PersonalList(BaseModel):
    idCounter: int | None = Field(default=None, ge=0, le=1_000_000_000_000, strict=True)
    model_config = ConfigDict(extra='forbid')
    id: UUID
    name: str = Field(max_length=120)
    items: list[PersonalItem] = Field(default_factory=list, max_length=1000)
    board: BoardDefinition | None = None
    properties: list[TaskProperty] | None = Field(default=None, max_length=30)
    propertyDisplay: dict[str, PropertyDisplay] | None = Field(default=None, max_length=34)

    @model_validator(mode='after')
    def unique_items(self):
        numbers = [item.metadata.number for item in self.items if item.metadata and item.metadata.number is not None]
        if len(set(numbers)) != len(numbers) or self.idCounter is not None and any(number > self.idCounter for number in numbers):
            raise ValueError('Task ID numbers must be unique and within the list counter.')
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError('Item IDs must be unique within a list.')
        definitions = {str(prop.id): prop for prop in self.properties or []}
        if len(definitions) != len(self.properties or []) or len({prop.name.lower() for prop in self.properties or []}) != len(definitions):
            raise ValueError('Property IDs and names must be unique.')
        if any(key not in definitions or not valid_property_value(value, definitions[key]) for item in self.items for key, value in (item.properties or {}).items()):
            raise ValueError('Task property values must match their definitions.')
        for key, display in (self.propertyDisplay or {}).items():
            if key not in {'status', 'date', 'value', 'image'} and key not in definitions:
                raise ValueError('Property display settings require an existing property.')
            if display.name is not None and (key != 'value' or display.name != display.name.strip() or display.name.lower() in {'name', 'status', 'date', 'image', *(prop.name.lower() for prop in self.properties or [])}):
                raise ValueError('Use a unique, nonempty name for Value.')
        allowed = set(self.board.order) if self.board else {'To do', 'In progress', 'Done'}
        if any(item.status not in allowed for item in self.items):
            raise ValueError('Tasks must belong to an active board column.')
        return self

class NotebookHabit(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    title: StrictStr = Field(min_length=1, max_length=120)
    createdOn: StrictStr = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    completions: list[StrictStr] = Field(default_factory=list, max_length=10000)
    archived: StrictBool = False

    @model_validator(mode='after')
    def valid_habit(self):
        from datetime import date
        if self.title != self.title.strip():
            raise ValueError('Use a nonempty, trimmed habit name.')
        date.fromisoformat(self.createdOn)
        if len(set(self.completions)) != len(self.completions):
            raise ValueError('Only one habit check-in is allowed per day.')
        for day in self.completions:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) or date.fromisoformat(day).isoformat() != day or day < self.createdOn:
                raise ValueError('Use valid check-in dates on or after the habit start.')
        return self

class ReadingBook(BaseModel):
    alreadyReadPages: StrictInt = Field(default=0, ge=0, le=1000000)
    model_config = ConfigDict(extra='forbid')
    id: UUID
    title: StrictStr = Field(min_length=1, max_length=200)
    author: StrictStr = Field(default='', max_length=200)
    rating: StrictInt = Field(default=0, ge=0, le=5)
    source: Literal['owned', 'bought', 'borrowed'] = 'owned'
    color: StrictStr = Field(pattern=r'^#[a-fA-F0-9]{6}$')

    @model_validator(mode='after')
    def valid_title(self):
        if not self.title.strip():
            raise ValueError('Enter a book title.')
        return self

class ReadingEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    bookId: UUID
    date: StrictStr = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    pages: StrictInt = Field(ge=1, le=10000)

    @model_validator(mode='after')
    def valid_date(self):
        from datetime import date
        date.fromisoformat(self.date)
        return self

class ReadingData(BaseModel):
    model_config = ConfigDict(extra='forbid')
    books: list[ReadingBook] = Field(default_factory=list, max_length=500)
    entries: list[ReadingEntry] = Field(default_factory=list, max_length=20000)

    @model_validator(mode='after')
    def valid_links(self):
        ids = {book.id for book in self.books}
        if len(ids) != len(self.books) or len({entry.id for entry in self.entries}) != len(self.entries):
            raise ValueError('Reading IDs must be unique.')
        if any(entry.bookId not in ids for entry in self.entries):
            raise ValueError('Reading entries must refer to an existing book.')
        return self

class MoodEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    date: StrictStr = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    mood: Literal['happy', 'excited', 'okay', 'sad', 'low', 'angry']

    @model_validator(mode='after')
    def valid_date(self):
        from datetime import date
        date.fromisoformat(self.date)
        return self

class NotebookPage(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    parentId: UUID | None = None
    title: str = Field(max_length=500)
    lists: list[PersonalList] = Field(default_factory=list, max_length=50)
    content: dict[str, Any] = Field(description='Tiptap document supporting text, lists, images, callouts, details/detailsSummary/detailsContent toggles, table/tableRow/tableCell/tableHeader and pageLink blocks. Layout blocks support columns with 2-5 column children and optional widths (one positive numeric weight up to 100 per column), tabs with 1-12 tabPanel children (UUID id, title up to 80 chars), imageGrid atoms (count 2, 3 or 4 and matching images containing null or url/alt objects), a generated tableOfContents atom, and viewBlock atoms with view, source, title, query, filter, sort (manual, title or date), group, collectionId, metric and optional columns settings. Columns are keyed by stable status IDs To do, In progress, Done or column:UUID; optional columnOrder retains their order. View preferences hiddenColumns and hideAggregation hide columns or item counts without changing tasks. Optional cardSize (small/medium/large), cardPreview (none/cover/content or a Files property UUID) and boolean cardImageFit configure board card sizing and previews. Optional cardProperties is a unique array of up to 36 built-in keys (status, date, value, cover, description) or property UUIDs controlling board card fields; null preserves Image/Date defaults and an empty array shows only names. Personal lists can own an atomic board definition and task assignment. Column definitions contain a name up to 60 characters and a gray/brown/orange/yellow/green/blue/purple/pink/red color. Toggle detailsSummary headingLevel accepts null or 1, 2, 3. Callout icon attrs use emoji: or icon: symbols, or null. Page links use a UUID pageId and a title. Block attrs textColor/backgroundColor accept null, gray, brown, orange, yellow, green, blue, purple, pink or red.')
    moods: list[MoodEntry] | None = Field(default=None, max_length=20000)
    reading: ReadingData | None = None
    habits: list[NotebookHabit] | None = Field(default=None, max_length=100)
    kind: Literal['meeting', 'board', 'calendar', 'dashboard', 'meds', 'habits'] | None = None
    icon: str | None = Field(default=None, max_length=60, pattern=PAGE_SYMBOL_PATTERN)
    cover: PageCover | None = None
    fullWidth: bool = True
    font: Literal['default', 'serif', 'mono'] = 'default'
    smallText: bool = False
    locked: bool = False
    favorite: bool = False
    deletedAt: str | None = Field(default=None, max_length=40)

    @model_validator(mode='after')
    def valid_content(self):
        if self.content.get('type') != 'doc' or not isinstance(self.content.get('content'), list):
            raise ValueError('A Tiptap document is required.')
        if len(json.dumps(self.content)) > 1_000_000:
            raise ValueError('This page exceeds the 1 MB document limit.')
        if self.moods and len({entry.date for entry in self.moods}) != len(self.moods):
            raise ValueError('Only one mood is allowed per day.')
        if self.habits and len({habit.id for habit in self.habits}) != len(self.habits):
            raise ValueError('Habit IDs must be unique within a page.')
        if self.kind in {'board', 'calendar', 'dashboard', 'meds', 'habits'}:
            nodes = self.content['content']
            if len(nodes) != 1 or not isinstance(nodes[0], dict) or nodes[0].get('type') != 'viewBlock' or not isinstance(nodes[0].get('attrs'), dict) or nodes[0]['attrs'].get('view') != ('dashboard' if self.kind in {'meds', 'habits'} else self.kind):
                raise ValueError('Fixed pages contain only their matching view.')
        allowed = {'doc', 'paragraph', 'heading', 'text', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak', 'image', 'callout', 'details', 'detailsSummary', 'detailsContent', 'table', 'tableRow', 'tableCell', 'tableHeader', 'pageLink', 'columns', 'column', 'tabs', 'tabPanel', 'tableOfContents', 'viewBlock', 'imageGrid'}
        pending = [(self.content, 0, None)]
        count = 0
        while pending:
            node, depth, parent_kind = pending.pop()
            count += 1
            if not isinstance(node, dict) or node.get('type') not in allowed or depth > 40 or count > 20000:
                raise ValueError('Unsupported or excessively nested document.')
            attrs = node.get('attrs', {})
            if not isinstance(attrs, dict):
                raise ValueError('Invalid block attributes.')
            colors = {'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'}
            for key in ('textColor', 'backgroundColor'):
                color = attrs.get(key)
                if color is not None and (not isinstance(color, str) or color not in colors):
                    raise ValueError('Unsupported block color.')
            if node.get('type') == 'callout' and attrs.get('icon') is not None:
                icon = attrs['icon']
                if not isinstance(icon, str) or len(icon) > 60 or not re.fullmatch(PAGE_SYMBOL_PATTERN, icon):
                    raise ValueError('Invalid callout icon.')
            if node.get('type') == 'pageLink':
                try:
                    UUID(str(attrs.get('pageId', '')))
                except (ValueError, TypeError):
                    raise ValueError('Page links require a page ID.')
                if not isinstance(attrs.get('title'), str) or len(attrs['title']) > 500:
                    raise ValueError('Invalid page link title.')
            if node.get('type') in {'tableCell', 'tableHeader'}:
                for key in ('colspan', 'rowspan'):
                    value = attrs.get(key, 1)
                    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 100:
                        raise ValueError('Invalid table cell span.')
            if node.get('type') == 'detailsSummary' and attrs.get('headingLevel') is not None and (type(attrs['headingLevel']) is not int or attrs['headingLevel'] not in {1, 2, 3}):
                raise ValueError('Unsupported toggle heading level.')
            if node.get('type') == 'details' and not isinstance(attrs.get('open', False), bool):
                raise ValueError('Invalid toggle state.')
            children = node.get('content', [])
            if not isinstance(children, list):
                raise ValueError('Invalid document children.')
            kind = node.get('type')
            if kind == 'imageGrid':
                images = attrs.get('images')
                if children or type(attrs.get('count')) is not int or attrs['count'] not in (2, 3, 4) or not isinstance(images, list) or len(images) != attrs['count']:
                    raise ValueError('Invalid image grid.')
                for image in images:
                    if image is None:
                        continue
                    if not isinstance(image, dict) or not isinstance(image.get('url'), str) or len(image['url']) > 2000 or not (re.fullmatch(r'https?://[^\s]+', image['url'], re.I) or re.fullmatch(r'/api/notebook/cover-images/[a-f0-9]{64}\.webp', image['url'])) or not isinstance(image.get('alt'), str) or len(image['alt']) > 500:
                        raise ValueError('Invalid grid image.')
            if kind == 'viewBlock':
                kinds = {'table', 'board', 'gallery', 'feed', 'calendar', 'line', 'horizontal-bar', 'vertical-bar', 'number', 'dashboard'}
                if children or any(not isinstance(attrs.get(key), str) for key in ('view', 'source', 'filter', 'sort', 'group')) or attrs.get('view') not in kinds or attrs.get('source') not in {'list', 'pages', 'tasks', 'meetings'} or attrs.get('filter') not in {'all', 'open', 'done'} or attrs.get('sort') not in {'title', 'date', 'manual'} or attrs.get('group') not in {'status', 'day', 'name'}:
                    raise ValueError('Unsupported view configuration.')
                columns = attrs.get('columns')
                if columns is not None:
                    if not isinstance(columns, dict) or len(columns) > 20 or any(not re.fullmatch(ITEM_STATUS_PATTERN, key) for key in columns):
                        raise ValueError('Invalid board columns.')
                    for column in columns.values():
                        BoardColumn.model_validate(column)
                if attrs.get('cardSize') is not None and attrs['cardSize'] not in ('small', 'medium', 'large'):
                    raise ValueError('Invalid board card size.')
                preview = attrs.get('cardPreview')
                if preview is not None and (not isinstance(preview, str) or preview not in {'none', 'cover', 'content'} and not re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', preview)):
                    raise ValueError('Invalid board card preview.')
                if attrs.get('cardImageFit') is not None and not isinstance(attrs['cardImageFit'], bool):
                    raise ValueError('Invalid board image fitting.')
                card_properties = attrs.get('cardProperties')
                if card_properties is not None and (not isinstance(card_properties, list) or len(card_properties) > 36 or any(not isinstance(key, str) or key not in {'status', 'date', 'value', 'cover', 'description'} and not re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', key) for key in card_properties) or len(set(card_properties)) != len(card_properties)):
                    raise ValueError('Invalid board card properties.')
                hidden = attrs.get('hiddenColumns')
                if hidden is not None and (not isinstance(hidden, list) or len(hidden) > 20 or any(not isinstance(key, str) or not re.fullmatch(ITEM_STATUS_PATTERN, key) for key in hidden) or len(set(hidden)) != len(hidden)):
                    raise ValueError('Invalid hidden board columns.')
                if attrs.get('hideAggregation') is not None and not isinstance(attrs['hideAggregation'], bool):
                    raise ValueError('Invalid board aggregation visibility.')
                order = attrs.get('columnOrder')
                if order is not None and (not isinstance(order, list) or not 1 <= len(order) <= 20 or any(not isinstance(key, str) or not re.fullmatch(ITEM_STATUS_PATTERN, key) for key in order) or len(set(order)) != len(order)):
                    raise ValueError('Invalid board column order.')
                if attrs.get('metric') is not None and (not isinstance(attrs['metric'], str) or attrs['metric'] not in {'count', 'sum'}):
                    raise ValueError('Unsupported view metric.')
                if attrs.get('collectionId') is not None:
                    try:
                        UUID(str(attrs['collectionId']))
                    except (ValueError, TypeError):
                        raise ValueError('Invalid list reference.')
                if any(not isinstance(attrs.get(key), str) or len(attrs[key]) > limit for key, limit in [('title', 120), ('query', 200)]):
                    raise ValueError('Invalid view title or search.')
            if kind == 'columns' and (not 2 <= len(children) <= 5 or any(not isinstance(child, dict) or child.get('type') != 'column' for child in children)):
                raise ValueError('Columns require two to five columns.')
            if kind == 'columns' and attrs.get('widths') is not None:
                widths = attrs['widths']
                if not isinstance(widths, list) or len(widths) != len(children) or any(type(width) not in (int, float) or not 0 < width <= 100 for width in widths):
                    raise ValueError('Column widths must match the columns and be greater than zero and at most 100.')
            if kind == 'tabs':
                if not 1 <= len(children) <= 12 or any(not isinstance(child, dict) or child.get('type') != 'tabPanel' for child in children):
                    raise ValueError('Tabs require one to twelve panels.')
                ids = [child.get('attrs', {}).get('id') if isinstance(child.get('attrs', {}), dict) else None for child in children]
                if any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
                    raise ValueError('Tab IDs must be unique within their group.')
            if kind == 'tabPanel':
                try:
                    UUID(str(attrs.get('id', '')))
                except (ValueError, TypeError):
                    raise ValueError('Tab panels require a stable ID.')
                if not isinstance(attrs.get('title'), str) or len(attrs['title']) > 80:
                    raise ValueError('Tab names must be at most 80 characters.')
            if kind in {'column', 'tabPanel'}:
                blocks = allowed - {'doc', 'text', 'hardBreak', 'column', 'tabPanel', 'detailsSummary', 'detailsContent', 'listItem', 'taskItem', 'tableRow', 'tableCell', 'tableHeader'}
                if not children or any(not isinstance(child, dict) or child.get('type') not in blocks for child in children):
                    raise ValueError('Layout panels require editable blocks.')
                if parent_kind != ('columns' if kind == 'column' else 'tabs'):
                    raise ValueError('Layout panels require their layout container.')
            if kind == 'tableOfContents' and children:
                raise ValueError('The table of contents is generated from headings.')
            pending.extend((child, depth + 1, kind) for child in children)
        return self

class Snapshot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=0)
    pages: list[NotebookPage] = Field(max_length=1000)

    @model_validator(mode='after')
    def valid_tree(self):
        list_ids = [collection.id for page in self.pages for collection in page.lists]
        if len(set(list_ids)) != len(list_ids):
            raise ValueError('List IDs must be unique across the notebook.')
        by_id = {page.id: page for page in self.pages}
        if len(by_id) != len(self.pages):
            raise ValueError('Page IDs must be unique.')
        if len(json.dumps([p.model_dump(mode='json') for p in self.pages])) > 16_000_000:
            raise ValueError('Notebook exceeds the 16 MB snapshot limit.')
        for page in self.pages:
            visited = {page.id}
            parent = page.parentId
            while parent is not None:
                if parent in visited or parent not in by_id:
                    raise ValueError('Page parents must exist and cannot form a cycle.')
                visited.add(parent)
                ancestor = by_id[parent]
                if ancestor.deletedAt and not page.deletedAt:
                    raise ValueError('Restore the parent before restoring a nested page.')
                parent = ancestor.parentId
        return self

class SnapshotStatus(Snapshot):
    backupWarning: str | None = None

class CoverUpload(BaseModel):
    url: str
