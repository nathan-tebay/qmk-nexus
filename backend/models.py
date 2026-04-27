from pydantic import BaseModel, ConfigDict, Field, model_serializer
from pydantic.alias_generators import to_camel


def _camel():
    return ConfigDict(alias_generator=to_camel, populate_by_name=True)


class User(BaseModel):
    model_config = _camel()

    id: str
    email: str
    name: str
    avatar_url: str | None = None


class KeyDef(BaseModel):
    model_config = _camel()

    id: str
    x: float
    y: float
    w: float = 1.0
    h: float = 1.0
    rotation: float = 0.0
    label: str = ''
    row: int | None = None
    col: int | None = None
    led_index: int | None = None
    shape: str = 'rect'


class MatrixPin(BaseModel):
    model_config = _camel()

    row: int
    pin: str


class ColPin(BaseModel):
    model_config = _camel()

    col: int
    pin: str


class Layer(BaseModel):
    model_config = _camel()

    id: str
    name: str
    keycodes: dict[str, str] = Field(default_factory=dict)


class EncoderElement(BaseModel):
    model_config = _camel()
    id: str
    x: float = 0.0
    y: float = 0.0
    has_switch: bool = False
    diameter: float = 14.0


class OledElement(BaseModel):
    model_config = _camel()
    id: str
    x: float = 0.0
    y: float = 0.0
    rotation: float = 0.0
    display_size: str = '128_32'
    content_mode: str = 'preset'
    startup_blocks: list[str] = Field(default_factory=list)
    active_blocks: list[str] = Field(default_factory=list)
    idle_blocks: list[str] = Field(default_factory=list)
    startup_duration: int = 15000
    idle_timeout: int = 10000
    custom_code: str = ''
    custom_code_template: str = ''
    logo_image: str = ''
    logo_bytes: list[int] = Field(default_factory=list)


class TrackballElement(BaseModel):
    model_config = _camel()
    id: str
    x: float = 0.0
    y: float = 0.0
    diameter: float = 34.0
    driver: str = 'pmw3360'


class MatrixEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias='from')
    to: str
    type: str

    @model_serializer
    def _serialize(self) -> dict:
        return {'from': self.from_, 'to': self.to, 'type': self.type}


class KeyboardConfig(BaseModel):
    model_config = _camel()

    id: str | None = None
    name: str = 'My Keyboard'
    mcu: str = 'atmega32u4'
    usb_vid: str = '0xFEED'
    usb_pid: str = '0x0000'
    manufacturer: str = ''
    keys: list[KeyDef] = Field(default_factory=list)
    row_pins: list[MatrixPin] = Field(default_factory=list)
    col_pins: list[ColPin] = Field(default_factory=list)
    matrix_edges: list[MatrixEdge] = Field(default_factory=list)
    layers: list[Layer] = Field(default_factory=list)
    features: dict[str, bool] = Field(default_factory=dict)
    feature_configs: dict[str, dict[str, str]] = Field(default_factory=dict)
    feature_input_values: dict[str, dict[str, str]] = Field(default_factory=dict)
    layout_macro: str = 'LAYOUT'
    source_mode: str = 'generated'
    upstream_keyboard: str | None = None
    upstream_files: dict[str, str] = Field(default_factory=dict)
    soft_serial_pin: str = 'D0'
    encoders: list[EncoderElement] = Field(default_factory=list)
    oleds: list[OledElement] = Field(default_factory=list)
    trackballs: list[TrackballElement] = Field(default_factory=list)
    custom_files: dict[str, str] = Field(default_factory=dict)
    encoder_keycodes: dict[str, str] = Field(default_factory=dict)


class BuildStatus(BaseModel):
    model_config = _camel()

    id: str
    keyboard_id: str
    status: str
    log: list[str] = Field(default_factory=list)
    artifact_path: str | None = Field(default=None, exclude=True)
    artifact_available: bool = False
    error: str | None = None


class TokenResponse(BaseModel):
    model_config = _camel()

    access_token: str
    token_type: str = 'bearer'
    user: User
