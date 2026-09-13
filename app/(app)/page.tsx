import React from 'react';

async function wait() {
    await new Promise((resolve) => setTimeout(resolve, 0))
}

const Page = async () => {
    await wait()

    return (
        <div>
            
        </div>
    );
};

export default Page;