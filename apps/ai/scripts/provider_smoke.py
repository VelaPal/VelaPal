"""Explicit live probe. Reads secrets from local .env; never prints keys or provider error bodies."""
import argparse
import asyncio
import io
import json
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from PIL import Image,ImageDraw,ImageFont
from velapal_ai.config import Settings
from velapal_ai.http import ServiceError
from velapal_ai.provider import Model
from velapal_ai.workflow import verify_findings

async def main():
    p=argparse.ArgumentParser();p.add_argument('--list-models',action='store_true');p.add_argument('--allow-live',action='store_true');args=p.parse_args()
    if not args.list_models and not args.allow_live:p.error('Use --list-models or --allow-live (sends requests to Gemini).')
    # Model discovery must work before a generation model has been chosen.
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1]/'.env')
    previous=os.environ.get('AI_MODEL_MODE');os.environ['AI_MODEL_MODE']='fixture'
    s=Settings.load()
    if previous is not None:os.environ['AI_MODEL_MODE']=previous
    if not s.gemini_key:raise SystemExit('Set GEMINI_API_KEY in apps/ai/.env locally first.')
    model=Model(s)
    try:
        models=await model.list_models()
        if args.list_models:print(json.dumps(models,indent=2));return
        if not s.gemini_model or not any(x['name']==f'models/{s.gemini_model}' and 'generateContent' in x['methods'] for x in models):
            raise SystemExit('GEMINI_MODEL is not available for generateContent. Run --list-models and choose an available model.')
        s.mode='live'
        docs=[{'sourceId':'probe_record','version':1,'locator':'record:1','text':'Listed Pocket Drive price: USD 59.00.'}]
        draft=await model.draft('personal',docs,'State the listed price with a citation.')
        findings,rejected=verify_findings(draft.model_dump(),docs)
        if not findings or rejected:raise SystemExit('FAIL structured JSON / grounding probe. Review the chosen model.')
        vector=await model.embed(docs[0]['text'],'RETRIEVAL_QUERY')
        img=Image.new('RGB',(620,180),'white');ImageDraw.Draw(img).text((35,45),'Pocket Drive 256GB',font=ImageFont.load_default(size=48),fill='black')
        buf=io.BytesIO();img.save(buf,format='PNG');vision=await model.extract_image(buf.getvalue(),'image/png')
        if not vision.legible or '256' not in ' '.join(vision.observations):raise SystemExit('FAIL vision probe: visible label was not read reliably.')
        print(json.dumps({'mode':'live','model':s.gemini_model,'structuredJson':'PASS','quoteGrounding':'PASS','embeddingDimensions':len(vector),'vision':'PASS','paypalCalled':False},indent=2))
    except ServiceError as e:raise SystemExit(f'{e.code}: {e.message} No fallback to fixture was used.')
    finally:await model.close()
if __name__=='__main__':asyncio.run(main())
