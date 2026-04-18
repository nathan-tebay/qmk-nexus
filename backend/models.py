from pydantic import BaseModel, ConfigDict, Field
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
    layers: list[Layer] = Field(default_factory=list)
    features: dict[str, bool] = Field(default_factory=dict)
    soft_serial_pin: str = 'D0'


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
