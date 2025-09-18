import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    PVE_HOST = os.getenv('PVE_HOST', '192.168.20.239')
    PVE_USER = os.getenv('PVE_USER', 'apiuser@pam')
    PVE_TOKEN_NAME = os.getenv('PVE_TOKEN_NAME', 'apitoken')
    PVE_TOKEN_VALUE = os.getenv('PVE_TOKEN_VALUE', '1453af10-a471-4439-a00d-df2234397952')
    PVE_VERIFY_SSL = os.getenv('PVE_VERIFY_SSL', 'False').lower() == 'true'