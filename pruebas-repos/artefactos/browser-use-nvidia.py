import asyncio, os
from browser_use import Agent, Browser, ChatOpenAI
async def main():
    llm = ChatOpenAI(model="nvidia/nemotron-3-ultra-550b-a55b", base_url="https://integrate.api.nvidia.com/v1", api_key=os.environ["NVIDIA_NIM_API_KEY"])
    browser = Browser("chromium", headless=True, executable_path="/opt/pw-browsers/chromium")
    agent = Agent(task="Go to https://example.com and tell me the exact text of the main heading (h1).", llm=llm, browser=browser)
    h = await agent.run(max_steps=6)
    print("RESULTADO FINAL:", h.final_result())
asyncio.run(main())
